import { Request, Response } from 'express';
import { serializePrisma } from '@ookamiiixd/baileys-store';
import { logger, prisma } from '../shared';

export const list = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { cursor = undefined, limit = 25 } = req.query as { cursor?: string; limit?: number };

    const chats = (
      await prisma.chat.findMany({
        cursor: cursor ? { pkId: Number(cursor) } : undefined,
        take: Number(limit),
        skip: cursor ? 1 : 0,
        where: { sessionId },
      })
    ).map((c) => serializePrisma(c));

    res.status(200).json({
      data: chats,
      cursor: chats.length !== 0 && chats.length === Number(limit) ? chats[chats.length - 1].pkId : null,
    });
  } catch (e) {
    const message = 'An error occured during chat list';
    logger.error(e, message);
    res.status(500).json({ error: message });
  }
};

function previewText(msg: any) {
  try {
    const m = msg?.message || {};
    if (m.conversation) return m.conversation;
    if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
    if (m.imageMessage?.caption) return m.imageMessage.caption;
    if (m.videoMessage?.caption) return m.videoMessage.caption;
    if (m.documentMessage?.fileName) return m.documentMessage.fileName;
    if (m.protocolMessage?.type) return `protocol: ${m.protocolMessage.type}`;
    if (m.audioMessage) return '[audio]';
    if (m.stickerMessage) return '[sticker]';
    return Object.keys(m)[0] || '';
  } catch {
    return '';
  }
}

export const listTable = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { cursor = undefined, limit = 25, q } = req.query as { cursor?: string; limit?: number; q?: string };

    const chats = await prisma.chat.findMany({
      cursor: cursor ? { pkId: Number(cursor) } : undefined,
      take: Number(limit),
      skip: cursor ? 1 : 0,
      where: { sessionId },
      orderBy: { pkId: 'desc' },
    });

    const jids = chats.map((c) => c.id).filter(Boolean) as string[];
    const contacts = await prisma.contact.findMany({ where: { sessionId, id: { in: jids } } });
    const contactMap = new Map(contacts.map((c) => [c.id, c]));

    const rows = [] as Array<{ jid: string; name: string | null; preview: string; pkId: number }>;
    for (const c of chats) {
      const jid = (c as any).id as string;
      const contact = contactMap.get(jid);
      const last = await prisma.message.findFirst({
        where: { sessionId, remoteJid: jid },
        orderBy: { pkId: 'desc' },
      });
      const name = (contact?.name || contact?.notify || (last as any)?.pushName) ?? null;
      const preview = last ? previewText(last) : '';
      rows.push({ jid, name, preview, pkId: (c as any).pkId });
    }

    // optional search filter by name, jid, or preview
    let filtered = rows;
    if (q && typeof q === 'string' && q.trim()) {
      const term = q.trim().toLowerCase();
      filtered = rows.filter((r) =>
        (r.name || '').toLowerCase().includes(term) || r.jid.toLowerCase().includes(term) || r.preview.toLowerCase().includes(term),
      );
    }

    res.status(200).json({
      rows: filtered,
      cursor: chats.length !== 0 && chats.length === Number(limit) ? chats[chats.length - 1].pkId : null,
    });
  } catch (e) {
    const message = 'An error occured during chat table list';
    logger.error(e, message);
    res.status(500).json({ error: message });
  }
};

export const find = async (req: Request, res: Response) => {
  try {
    const { sessionId, jid } = req.params;
    const { cursor = undefined, limit = 25, direction } = req.query as { cursor?: string; limit?: number; direction?: string };

    const messages = (
      await prisma.message.findMany({
        cursor: cursor ? { pkId: Number(cursor) } : undefined,
        take: Number(limit),
        skip: cursor ? 1 : 0,
        where: { sessionId, remoteJid: jid },
        orderBy: { pkId: 'desc' },
      })
    ).map((m) => serializePrisma(m));

    const filtered =
      direction === 'outbox'
        ? messages.filter((m: any) => {
            const v = m?.key?.fromMe ?? m?.keyFromMe ?? m?.fromMe;
            if (typeof v === 'boolean') return v;
            if (typeof v === 'number') return v === 1;
            if (typeof v === 'string') return v === 'true' || v === '1';
            return false;
          })
        : direction === 'inbox'
        ? messages.filter((m: any) => {
            const v = m?.key?.fromMe ?? m?.keyFromMe ?? m?.fromMe;
            if (typeof v === 'boolean') return !v;
            if (typeof v === 'number') return v !== 1;
            if (typeof v === 'string') return !(v === 'true' || v === '1');
            return true;
          })
        : messages;

    res.status(200).json({
      data: filtered,
      cursor:
        filtered.length !== 0 && filtered.length === Number(limit)
          ? filtered[filtered.length - 1].pkId
          : null,
    });
  } catch (e) {
    const message = 'An error occured during chat find';
    logger.error(e, message);
    res.status(500).json({ error: message });
  }
};
