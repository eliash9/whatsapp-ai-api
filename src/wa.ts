import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  isJidBroadcast,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  WAMessage,
} from '@adiwajshing/baileys';
import { initStore, Store, useSession } from '@ookamiiixd/baileys-store';
import { toDataURL } from 'qrcode';

import { logger, prisma } from './shared';
import { generateAIReply } from './services/ai';
import { delay } from './utils';

type SessionSocket = ReturnType<typeof makeWASocket> & {
  destroy: (logout?: boolean) => Promise<void>;
  store: Store;
};

const sessions = new Map<string, SessionSocket>();
const retries = new Map<string, number>();
const SSEQRGenerations = new Map<string, number>();

const RECONNECT_INTERVAL = Number(5000);
const MAX_RECONNECT_RETRIES = Number(5);
const SSE_MAX_QR_GENERATION = Number(5);
const SESSION_CONFIG_ID = 'session-config';

export async function init() {
  initStore({ prisma, logger: logger as any });

  const configSessions = await prisma.session.findMany({
    select: { sessionId: true, data: true },
    where: { id: { startsWith: SESSION_CONFIG_ID } },
  });

  for (const { sessionId, data } of configSessions) {
    const { readIncomingMessages, ...socketConfig } = JSON.parse(data ?? '{}') as any;
    createSession({ sessionId, readIncomingMessages, socketConfig });
  }
}

function shouldReconnect(sessionId: string) {
  let attempts = retries.get(sessionId) ?? 0;
  if (attempts < MAX_RECONNECT_RETRIES) {
    attempts += 1;
    retries.set(sessionId, attempts);
    return true;
  }
  return false;
}

type CreateSessionOptions = {
  sessionId: string;
  res?: import('express').Response;
  SSE?: boolean;
  readIncomingMessages?: boolean;
  socketConfig?: Partial<Parameters<typeof makeWASocket>[0]>;
};

export async function createSession(options: CreateSessionOptions) {
  const { sessionId, res, SSE = false, readIncomingMessages = false, socketConfig } = options;
  const configID = `${SESSION_CONFIG_ID}-${sessionId}`;

  let connectionState: any = { connection: 'close' };

  const destroy = async (logout = true) => {
    try {
      await Promise.all([
        logout && socket.logout(),
        prisma.chat.deleteMany({ where: { sessionId } }),
        prisma.contact.deleteMany({ where: { sessionId } }),
        prisma.message.deleteMany({ where: { sessionId } }),
        prisma.groupMetadata.deleteMany({ where: { sessionId } }),
        prisma.session.deleteMany({ where: { sessionId } }),
      ]);
    } catch (e) {
      logger.error(e, 'An error occured during session destroy');
    } finally {
      sessions.delete(sessionId);
    }
  };

  const handleConnectionClose = () => {
    const code = (connectionState.lastDisconnect?.error?.output as any)?.statusCode;
    const restartRequired = code === DisconnectReason.restartRequired;
    const doNotReconnect = !shouldReconnect(sessionId);

    if (code === DisconnectReason.loggedOut || doNotReconnect) {
      if (res) {
        !SSE && !res.headersSent && res.status(500).json({ error: 'Unable to create session' });
        res.end();
      }
      destroy(doNotReconnect);
      return;
    }

    if (!restartRequired) {
      logger.info({ attempts: retries.get(sessionId) ?? 1, sessionId }, 'Reconnecting...');
    }
    setTimeout(() => createSession(options), restartRequired ? 0 : RECONNECT_INTERVAL);
  };

  const handleNormalConnectionUpdate = async () => {
    if (connectionState.qr?.length) {
      if (res && !res.headersSent) {
        try {
          const qr = await toDataURL(connectionState.qr);
          res.status(200).json({ qr });
          return;
        } catch (e) {
          logger.error(e, 'An error occured during QR generation');
          res.status(500).json({ error: 'Unable to generate QR' });
        }
      }
      destroy();
    }
  };

  const handleSSEConnectionUpdate = async () => {
    let qr: string | undefined = undefined;
    if (connectionState.qr?.length) {
      try {
        qr = await toDataURL(connectionState.qr);
      } catch (e) {
        logger.error(e, 'An error occured during QR generation');
      }
    }

    const currentGenerations = SSEQRGenerations.get(sessionId) ?? 0;
    if (!res || res.writableEnded || (qr && currentGenerations >= SSE_MAX_QR_GENERATION)) {
      res && !res.writableEnded && res.end();
      destroy();
      return;
    }

    const data = { ...connectionState, qr };
    if (qr) SSEQRGenerations.set(sessionId, currentGenerations + 1);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const handleConnectionUpdate = SSE ? handleSSEConnectionUpdate : handleNormalConnectionUpdate;

  const { state, saveCreds } = await useSession(sessionId);

  const socket = makeWASocket({
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    generateHighQualityLinkPreview: true,
    ...socketConfig,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger as any),
    },
    logger: logger as any,
    shouldIgnoreJid: (jid) => isJidBroadcast(jid),
    getMessage: async (key) => {
      const data = await prisma.message.findFirst({
        where: { remoteJid: key.remoteJid!, id: key.id!, sessionId },
      });
      return (data?.message as WAMessage['message']) || undefined;
    },
  });

  const store = new Store(sessionId, socket.ev);
  sessions.set(sessionId, Object.assign(socket, { destroy, store }));

  socket.ev.on('creds.update', saveCreds);
  socket.ev.on('connection.update', (update) => {
    connectionState = update;
    const { connection } = update as any;
    if (connection === 'open') {
      retries.delete(sessionId);
      SSEQRGenerations.delete(sessionId);
    }
    if (connection === 'close') handleConnectionClose();
    handleConnectionUpdate();
  });

  if (readIncomingMessages) {
    socket.ev.on('messages.upsert', async (m) => {
      const message = m.messages[0];
      if (message.key.fromMe || m.type !== 'notify') return;
      await delay(1000);
      await socket.readMessages([message.key]);
    });
  }

  // AI auto-reply (if enabled per session)
  socket.ev.on('messages.upsert', async (m) => {
    try {
      const msgs = m.messages || [];
      const ticketingEnabled = ((process.env.TICKETING_ENABLED ?? 'true') + '').toLowerCase() === 'true';
      for (const msg of msgs) {
        if (!msg || msg.key?.fromMe) continue; // allow non-notify types too (some transports emit 'append')
        // Ignore group chats: only auto-reply to private chats
        const remoteJid = msg.key.remoteJid || '';
        if (remoteJid.endsWith('@g.us')) continue;
        // normalize to user JID (convert LID to s.whatsapp.net)
        const userJid = jidNormalizedUser(remoteJid);
        const unwrap = (mm: any): any => (mm?.ephemeralMessage?.message) || (mm?.viewOnceMessage?.message) || mm;
        const mm = unwrap((msg.message as any) || {});
        let text = mm?.conversation
          || mm?.extendedTextMessage?.text
          || mm?.imageMessage?.caption
          || mm?.videoMessage?.caption
          || mm?.documentMessage?.fileName
          || '';
        if (!text) {
          if (mm?.audioMessage) text = '[audio]';
          else if (mm?.stickerMessage) text = '[sticker]';
          else if (mm?.contactMessage) text = '[contact]';
          else if (mm?.locationMessage) text = '[location]';
          else text = Object.keys(mm || {})[0] || '';
        }
        // Ticketing hook (optional)
        if (ticketingEnabled) {
          try {
            const now = new Date();
            let ticket = await (prisma as any).ticket.findFirst({
              where: { sessionId, customerJid: userJid, NOT: { status: 'closed' } },
              orderBy: { pkId: 'desc' },
            });
            if (!ticket) {
              ticket = await (prisma as any).ticket.create({ data: { sessionId, customerJid: userJid, status: 'open', lastMessageAt: now } });
            } else {
              const data: any = { lastMessageAt: now };
              if (ticket.status === 'closed') data.status = 'open';
              await (prisma as any).ticket.update({ where: { pkId: ticket.pkId }, data });
            }
            try {
              let messagePkId: number | undefined = undefined;
              const keyId = msg?.key?.id as string | undefined;
              if (keyId) {
                const saved = await (prisma as any).message.findUnique({ where: { sessionId_remoteJid_id: { sessionId, remoteJid, id: keyId } } });
                if (saved) messagePkId = saved.pkId;
              }
              await (prisma as any).ticketMessage.create({ data: { ticketId: ticket.pkId, direction: 'in', text, ...(messagePkId ? { messagePkId } : {}) } });
            } catch {
              await (prisma as any).ticketMessage.create({ data: { ticketId: ticket.pkId, direction: 'in', text } });
            }
            (msg as any)._ticketPkId = ticket.pkId;
          } catch (err) {
            logger.error(err, 'Ticket hook (inbound) failed');
          }
        }
        // Per-ticket AI toggle: default enabled unless last toggle is disabled
        try {
          const ticket = await (prisma as any).ticket.findFirst({ where: { sessionId, customerJid: userJid }, orderBy: { pkId: 'desc' } });
          if (ticket) {
            const lastToggle = await (prisma as any).ticketMessage.findFirst({ where: { ticketId: ticket.pkId, OR: [{ text: '[AI_DISABLED]' }, { text: '[AI_ENABLED]' }] }, orderBy: { pkId: 'desc' } });
            if (lastToggle && lastToggle.text === '[AI_DISABLED]') {
              continue; // Skip AI for this ticket
            }
          }
        } catch {}

        const cfgDb = await (prisma as any).aiSetting.findUnique({ where: { sessionId } });
        let aiCfg: any = null;
        if (cfgDb?.enabled) {
          aiCfg = cfgDb;
        } else {
          const aiEnabledEnv = ((process.env.AI_ENABLED ?? 'false') + '').toLowerCase() === 'true';
          if (!aiEnabledEnv) continue;
          aiCfg = {
            prompt: process.env.AI_PROMPT || '',
            model: process.env.AI_MODEL || undefined,
            temp: process.env.AI_TEMP ? Number(process.env.AI_TEMP) : undefined,
            providerBaseUrl: process.env.AI_BASE_URL || undefined,
            providerApiKey: process.env.AI_API_KEY || undefined,
            authHeaderName: process.env.AI_AUTH_HEADER || undefined,
            authScheme: process.env.AI_AUTH_SCHEME || undefined,
            extraHeaders: process.env.AI_EXTRA_HEADERS || undefined,
          };
        }
        // Augment prompt with Quick Replies knowledge base
        const kb = await buildQuickRepliesKB(text);
        const master = (aiCfg.prompt || '').toString().trim();
        const combinedPrompt = [
          master || 'Anda adalah asisten WhatsApp yang membantu dan sopan.',
          kb ? `Gunakan basis pengetahuan berikut hanya jika relevan dan akurat. Jika tidak relevan, abaikan.
${kb}` : '',
        ].filter(Boolean).join('\n\n');
        const reply = await generateAIReply(text, { prompt: combinedPrompt, model: aiCfg.model, temp: aiCfg.temp, baseUrl: aiCfg?.providerBaseUrl || undefined, apiKey: aiCfg?.providerApiKey || undefined, authHeaderName: aiCfg?.authHeaderName || undefined, authScheme: aiCfg?.authScheme || undefined, extraHeaders: aiCfg?.extraHeaders || undefined });
        if (!reply) continue;
        await socket.sendMessage(msg.key.remoteJid!, { text: reply }, { quoted: msg });
        // Record AI reply if ticketing enabled
        if (ticketingEnabled) {
          try {
            const ticketId = (msg as any)._ticketPkId as number | undefined;
            if (ticketId) {
              await (prisma as any).ticketMessage.create({ data: { ticketId, direction: 'out', text: reply } });
              const current = await (prisma as any).ticket.findUnique({ where: { pkId: ticketId } });
              const nextStatus = current?.status === 'open' || current?.status === 'assigned' ? 'in_progress' : current?.status;
              await (prisma as any).ticket.update({ where: { pkId: ticketId }, data: { lastMessageAt: new Date(), status: nextStatus } });
            } else {
              let ticket = await (prisma as any).ticket.findFirst({ where: { sessionId, customerJid: userJid, NOT: { status: 'closed' } }, orderBy: { pkId: 'desc' } });
              if (!ticket) ticket = await (prisma as any).ticket.create({ data: { sessionId, customerJid: userJid, status: 'open', lastMessageAt: new Date() } });
              await (prisma as any).ticketMessage.create({ data: { ticketId: ticket.pkId, direction: 'out', text: reply } });
              const nextStatus = ticket.status === 'open' || ticket.status === 'assigned' ? 'in_progress' : ticket.status;
              await (prisma as any).ticket.update({ where: { pkId: ticket.pkId }, data: { lastMessageAt: new Date(), status: nextStatus } });
            }
          } catch (err) {
            logger.error(err, 'Ticket hook (AI reply) failed');
          }
        }
      }
    } catch (e) {
      logger.error(e, 'AI auto-reply error');
    }
  });

  await prisma.session.upsert({
    create: {
      id: configID,
      sessionId,
      data: JSON.stringify({ readIncomingMessages, ...socketConfig }),
    },
    update: {},
    where: { sessionId_id: { id: configID, sessionId } },
  });
}

export function listSessions() {
  return Array.from(sessions.keys());
}

export function getSession(sessionId: string) {
  const s = sessions.get(sessionId);
  if (!s) throw new Error('Session not found');
  return s;
}

export function sessionExists(sessionId: string) {
  return sessions.has(sessionId);
}

export function getSessionStatus(session: SessionSocket) {
  // Basic status derived from presence of store and ev
  // More detailed state is tracked in controller via connection.update events
  return session?.ev ? 'active' : 'close';
}

export async function deleteSession(sessionId: string) {
  const session = getSession(sessionId);
  await session.destroy();
}

export async function jidExists(
  session: SessionSocket,
  jid: string,
  type: 'number' | 'group' = 'number',
) {
  try {
    if (type === 'group') {
      await session.groupMetadata(jid);
      return true;
    }
    const [result] = await session.onWhatsApp(jid);
    return !!result?.exists;
  } catch {
    return false;
  }
}

export { downloadMediaMessage };

// Build a lightweight knowledge base from QuickReply items relevant to the user's text
async function buildQuickRepliesKB(userText: string): Promise<string | null> {
  try {
    const q = String(userText || '').toLowerCase();
    if (!q) return null;
    // Extract up to 5 meaningful keywords (length >= 4)
    const tokens = Array.from(new Set(q.split(/[^a-z0-9]+/i).filter(w => w && w.length >= 4))).slice(0, 5);
    let rows: any[] = [];
    if (tokens.length) {
      // Build LIKE clauses
      const likes = tokens.map(() => '(`title` LIKE ? OR `text` LIKE ?)').join(' OR ');
      const params: any[] = [];
      for (const t of tokens) { params.push(`%${t}%`, `%${t}%`); }
      rows = await prisma.$queryRawUnsafe(`SELECT \`title\`, \`text\` FROM \`QuickReply\` WHERE ${likes} ORDER BY \`updatedAt\` DESC LIMIT 8`, ...params);
    } else {
      rows = await prisma.$queryRawUnsafe('SELECT `title`, `text` FROM `QuickReply` ORDER BY `updatedAt` DESC LIMIT 5');
    }
    if (!rows || !rows.length) return null;
    const clamp = (s: any, n: number) => {
      const str = (s ?? '').toString();
      return str.length > n ? str.slice(0, n) + '…' : str;
    };
    const lines: string[] = [];
    for (const r of rows) {
      const title = clamp(r.title, 80);
      const body = clamp(r.text, 500);
      lines.push(`- ${title}: ${body}`);
    }
    // Limit total size to ~2k chars
    const out = lines.join('\n');
    return out.length > 2000 ? out.slice(0, 2000) + '…' : out;
  } catch (e) {
    try { logger.warn(e, 'buildQuickRepliesKB failed'); } catch {}
    return null;
  }
}
