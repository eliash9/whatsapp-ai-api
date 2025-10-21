"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadMediaMessage = exports.jidExists = exports.deleteSession = exports.getSessionStatus = exports.sessionExists = exports.getSession = exports.listSessions = exports.createSession = exports.init = void 0;
const baileys_1 = __importStar(require("@adiwajshing/baileys"));
Object.defineProperty(exports, "downloadMediaMessage", { enumerable: true, get: function () { return baileys_1.downloadMediaMessage; } });
const baileys_store_1 = require("@ookamiiixd/baileys-store");
const qrcode_1 = require("qrcode");
const shared_1 = require("./shared");
const ai_1 = require("./services/ai");
const utils_1 = require("./utils");
const sessions = new Map();
const retries = new Map();
const SSEQRGenerations = new Map();
const RECONNECT_INTERVAL = Number(5000);
const MAX_RECONNECT_RETRIES = Number(5);
const SSE_MAX_QR_GENERATION = Number(5);
const SESSION_CONFIG_ID = 'session-config';
async function init() {
    (0, baileys_store_1.initStore)({ prisma: shared_1.prisma, logger: shared_1.logger });
    const configSessions = await shared_1.prisma.session.findMany({
        select: { sessionId: true, data: true },
        where: { id: { startsWith: SESSION_CONFIG_ID } },
    });
    for (const { sessionId, data } of configSessions) {
        const _a = JSON.parse(data !== null && data !== void 0 ? data : '{}'), { readIncomingMessages } = _a, socketConfig = __rest(_a, ["readIncomingMessages"]);
        createSession({ sessionId, readIncomingMessages, socketConfig });
    }
}
exports.init = init;
function shouldReconnect(sessionId) {
    var _a;
    let attempts = (_a = retries.get(sessionId)) !== null && _a !== void 0 ? _a : 0;
    if (attempts < MAX_RECONNECT_RETRIES) {
        attempts += 1;
        retries.set(sessionId, attempts);
        return true;
    }
    return false;
}
async function createSession(options) {
    const { sessionId, res, SSE = false, readIncomingMessages = false, socketConfig } = options;
    const configID = `${SESSION_CONFIG_ID}-${sessionId}`;
    let connectionState = { connection: 'close' };
    const destroy = async (logout = true) => {
        try {
            await Promise.all([
                logout && socket.logout(),
                shared_1.prisma.chat.deleteMany({ where: { sessionId } }),
                shared_1.prisma.contact.deleteMany({ where: { sessionId } }),
                shared_1.prisma.message.deleteMany({ where: { sessionId } }),
                shared_1.prisma.groupMetadata.deleteMany({ where: { sessionId } }),
                shared_1.prisma.session.deleteMany({ where: { sessionId } }),
            ]);
        }
        catch (e) {
            shared_1.logger.error(e, 'An error occured during session destroy');
        }
        finally {
            sessions.delete(sessionId);
        }
    };
    const handleConnectionClose = () => {
        var _a, _b, _c, _d;
        const code = (_c = (_b = (_a = connectionState.lastDisconnect) === null || _a === void 0 ? void 0 : _a.error) === null || _b === void 0 ? void 0 : _b.output) === null || _c === void 0 ? void 0 : _c.statusCode;
        const restartRequired = code === baileys_1.DisconnectReason.restartRequired;
        const doNotReconnect = !shouldReconnect(sessionId);
        if (code === baileys_1.DisconnectReason.loggedOut || doNotReconnect) {
            if (res) {
                !SSE && !res.headersSent && res.status(500).json({ error: 'Unable to create session' });
                res.end();
            }
            destroy(doNotReconnect);
            return;
        }
        if (!restartRequired) {
            shared_1.logger.info({ attempts: (_d = retries.get(sessionId)) !== null && _d !== void 0 ? _d : 1, sessionId }, 'Reconnecting...');
        }
        setTimeout(() => createSession(options), restartRequired ? 0 : RECONNECT_INTERVAL);
    };
    const handleNormalConnectionUpdate = async () => {
        var _a;
        if ((_a = connectionState.qr) === null || _a === void 0 ? void 0 : _a.length) {
            if (res && !res.headersSent) {
                try {
                    const qr = await (0, qrcode_1.toDataURL)(connectionState.qr);
                    res.status(200).json({ qr });
                    return;
                }
                catch (e) {
                    shared_1.logger.error(e, 'An error occured during QR generation');
                    res.status(500).json({ error: 'Unable to generate QR' });
                }
            }
            destroy();
        }
    };
    const handleSSEConnectionUpdate = async () => {
        var _a, _b;
        let qr = undefined;
        if ((_a = connectionState.qr) === null || _a === void 0 ? void 0 : _a.length) {
            try {
                qr = await (0, qrcode_1.toDataURL)(connectionState.qr);
            }
            catch (e) {
                shared_1.logger.error(e, 'An error occured during QR generation');
            }
        }
        const currentGenerations = (_b = SSEQRGenerations.get(sessionId)) !== null && _b !== void 0 ? _b : 0;
        if (!res || res.writableEnded || (qr && currentGenerations >= SSE_MAX_QR_GENERATION)) {
            res && !res.writableEnded && res.end();
            destroy();
            return;
        }
        const data = Object.assign(Object.assign({}, connectionState), { qr });
        if (qr)
            SSEQRGenerations.set(sessionId, currentGenerations + 1);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    const handleConnectionUpdate = SSE ? handleSSEConnectionUpdate : handleNormalConnectionUpdate;
    const { state, saveCreds } = await (0, baileys_store_1.useSession)(sessionId);
    const socket = (0, baileys_1.default)(Object.assign(Object.assign({ printQRInTerminal: false, browser: baileys_1.Browsers.ubuntu('Chrome'), generateHighQualityLinkPreview: true }, socketConfig), { auth: {
            creds: state.creds,
            keys: (0, baileys_1.makeCacheableSignalKeyStore)(state.keys, shared_1.logger),
        }, logger: shared_1.logger, shouldIgnoreJid: (jid) => (0, baileys_1.isJidBroadcast)(jid), getMessage: async (key) => {
            const data = await shared_1.prisma.message.findFirst({
                where: { remoteJid: key.remoteJid, id: key.id, sessionId },
            });
            return (data === null || data === void 0 ? void 0 : data.message) || undefined;
        } }));
    const store = new baileys_store_1.Store(sessionId, socket.ev);
    sessions.set(sessionId, Object.assign(socket, { destroy, store }));
    socket.ev.on('creds.update', saveCreds);
    socket.ev.on('connection.update', (update) => {
        connectionState = update;
        const { connection } = update;
        if (connection === 'open') {
            retries.delete(sessionId);
            SSEQRGenerations.delete(sessionId);
        }
        if (connection === 'close')
            handleConnectionClose();
        handleConnectionUpdate();
    });
    if (readIncomingMessages) {
        socket.ev.on('messages.upsert', async (m) => {
            const message = m.messages[0];
            if (message.key.fromMe || m.type !== 'notify')
                return;
            await (0, utils_1.delay)(1000);
            await socket.readMessages([message.key]);
        });
    }
    // AI auto-reply (if enabled per session)
    socket.ev.on('messages.upsert', async (m) => {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        try {
            const msgs = m.messages || [];
            const ticketingEnabled = (((_a = process.env.TICKETING_ENABLED) !== null && _a !== void 0 ? _a : 'true') + '').toLowerCase() === 'true';
            for (const msg of msgs) {
                if (!msg || ((_b = msg.key) === null || _b === void 0 ? void 0 : _b.fromMe))
                    continue; // allow non-notify types too (some transports emit 'append')
                // Ignore group chats: only auto-reply to private chats
                const remoteJid = msg.key.remoteJid || '';
                if (remoteJid.endsWith('@g.us'))
                    continue;
                // normalize to user JID (convert LID to s.whatsapp.net)
                const userJid = (0, baileys_1.jidNormalizedUser)(remoteJid);
                const unwrap = (mm) => { var _a, _b; return ((_a = mm === null || mm === void 0 ? void 0 : mm.ephemeralMessage) === null || _a === void 0 ? void 0 : _a.message) || ((_b = mm === null || mm === void 0 ? void 0 : mm.viewOnceMessage) === null || _b === void 0 ? void 0 : _b.message) || mm; };
                const mm = unwrap(msg.message || {});
                let text = (mm === null || mm === void 0 ? void 0 : mm.conversation)
                    || ((_c = mm === null || mm === void 0 ? void 0 : mm.extendedTextMessage) === null || _c === void 0 ? void 0 : _c.text)
                    || ((_d = mm === null || mm === void 0 ? void 0 : mm.imageMessage) === null || _d === void 0 ? void 0 : _d.caption)
                    || ((_e = mm === null || mm === void 0 ? void 0 : mm.videoMessage) === null || _e === void 0 ? void 0 : _e.caption)
                    || ((_f = mm === null || mm === void 0 ? void 0 : mm.documentMessage) === null || _f === void 0 ? void 0 : _f.fileName)
                    || '';
                if (!text) {
                    if (mm === null || mm === void 0 ? void 0 : mm.audioMessage)
                        text = '[audio]';
                    else if (mm === null || mm === void 0 ? void 0 : mm.stickerMessage)
                        text = '[sticker]';
                    else if (mm === null || mm === void 0 ? void 0 : mm.contactMessage)
                        text = '[contact]';
                    else if (mm === null || mm === void 0 ? void 0 : mm.locationMessage)
                        text = '[location]';
                    else
                        text = Object.keys(mm || {})[0] || '';
                }
                // Ticketing hook (optional)
                if (ticketingEnabled) {
                    try {
                        const now = new Date();
                        let ticket = await shared_1.prisma.ticket.findFirst({
                            where: { sessionId, customerJid: userJid, NOT: { status: 'closed' } },
                            orderBy: { pkId: 'desc' },
                        });
                        if (!ticket) {
                            ticket = await shared_1.prisma.ticket.create({ data: { sessionId, customerJid: userJid, status: 'open', lastMessageAt: now } });
                        }
                        else {
                            const data = { lastMessageAt: now };
                            if (ticket.status === 'closed')
                                data.status = 'open';
                            await shared_1.prisma.ticket.update({ where: { pkId: ticket.pkId }, data });
                        }
                        try {
                            let messagePkId = undefined;
                            const keyId = (_g = msg === null || msg === void 0 ? void 0 : msg.key) === null || _g === void 0 ? void 0 : _g.id;
                            if (keyId) {
                                const saved = await shared_1.prisma.message.findUnique({ where: { sessionId_remoteJid_id: { sessionId, remoteJid, id: keyId } } });
                                if (saved)
                                    messagePkId = saved.pkId;
                            }
                            await shared_1.prisma.ticketMessage.create({ data: Object.assign({ ticketId: ticket.pkId, direction: 'in', text }, (messagePkId ? { messagePkId } : {})) });
                        }
                        catch (_j) {
                            await shared_1.prisma.ticketMessage.create({ data: { ticketId: ticket.pkId, direction: 'in', text } });
                        }
                        msg._ticketPkId = ticket.pkId;
                    }
                    catch (err) {
                        shared_1.logger.error(err, 'Ticket hook (inbound) failed');
                    }
                }
                // Per-ticket AI toggle: default enabled unless last toggle is disabled
                try {
                    const ticket = await shared_1.prisma.ticket.findFirst({ where: { sessionId, customerJid: userJid }, orderBy: { pkId: 'desc' } });
                    if (ticket) {
                        const lastToggle = await shared_1.prisma.ticketMessage.findFirst({ where: { ticketId: ticket.pkId, OR: [{ text: '[AI_DISABLED]' }, { text: '[AI_ENABLED]' }] }, orderBy: { pkId: 'desc' } });
                        if (lastToggle && lastToggle.text === '[AI_DISABLED]') {
                            continue; // Skip AI for this ticket
                        }
                    }
                }
                catch (_k) { }
                const cfgDb = await shared_1.prisma.aiSetting.findUnique({ where: { sessionId } });
                let aiCfg = null;
                if (cfgDb === null || cfgDb === void 0 ? void 0 : cfgDb.enabled) {
                    aiCfg = cfgDb;
                }
                else {
                    const aiEnabledEnv = (((_h = process.env.AI_ENABLED) !== null && _h !== void 0 ? _h : 'false') + '').toLowerCase() === 'true';
                    if (!aiEnabledEnv)
                        continue;
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
                const reply = await (0, ai_1.generateAIReply)(text, { prompt: combinedPrompt, model: aiCfg.model, temp: aiCfg.temp, baseUrl: (aiCfg === null || aiCfg === void 0 ? void 0 : aiCfg.providerBaseUrl) || undefined, apiKey: (aiCfg === null || aiCfg === void 0 ? void 0 : aiCfg.providerApiKey) || undefined, authHeaderName: (aiCfg === null || aiCfg === void 0 ? void 0 : aiCfg.authHeaderName) || undefined, authScheme: (aiCfg === null || aiCfg === void 0 ? void 0 : aiCfg.authScheme) || undefined, extraHeaders: (aiCfg === null || aiCfg === void 0 ? void 0 : aiCfg.extraHeaders) || undefined });
                if (!reply)
                    continue;
                await socket.sendMessage(msg.key.remoteJid, { text: reply }, { quoted: msg });
                // Record AI reply if ticketing enabled
                if (ticketingEnabled) {
                    try {
                        const ticketId = msg._ticketPkId;
                        if (ticketId) {
                            await shared_1.prisma.ticketMessage.create({ data: { ticketId, direction: 'out', text: reply } });
                            const current = await shared_1.prisma.ticket.findUnique({ where: { pkId: ticketId } });
                            const nextStatus = (current === null || current === void 0 ? void 0 : current.status) === 'open' || (current === null || current === void 0 ? void 0 : current.status) === 'assigned' ? 'in_progress' : current === null || current === void 0 ? void 0 : current.status;
                            await shared_1.prisma.ticket.update({ where: { pkId: ticketId }, data: { lastMessageAt: new Date(), status: nextStatus } });
                        }
                        else {
                            let ticket = await shared_1.prisma.ticket.findFirst({ where: { sessionId, customerJid: userJid, NOT: { status: 'closed' } }, orderBy: { pkId: 'desc' } });
                            if (!ticket)
                                ticket = await shared_1.prisma.ticket.create({ data: { sessionId, customerJid: userJid, status: 'open', lastMessageAt: new Date() } });
                            await shared_1.prisma.ticketMessage.create({ data: { ticketId: ticket.pkId, direction: 'out', text: reply } });
                            const nextStatus = ticket.status === 'open' || ticket.status === 'assigned' ? 'in_progress' : ticket.status;
                            await shared_1.prisma.ticket.update({ where: { pkId: ticket.pkId }, data: { lastMessageAt: new Date(), status: nextStatus } });
                        }
                    }
                    catch (err) {
                        shared_1.logger.error(err, 'Ticket hook (AI reply) failed');
                    }
                }
            }
        }
        catch (e) {
            shared_1.logger.error(e, 'AI auto-reply error');
        }
    });
    await shared_1.prisma.session.upsert({
        create: {
            id: configID,
            sessionId,
            data: JSON.stringify(Object.assign({ readIncomingMessages }, socketConfig)),
        },
        update: {},
        where: { sessionId_id: { id: configID, sessionId } },
    });
}
exports.createSession = createSession;
function listSessions() {
    return Array.from(sessions.keys());
}
exports.listSessions = listSessions;
function getSession(sessionId) {
    const s = sessions.get(sessionId);
    if (!s)
        throw new Error('Session not found');
    return s;
}
exports.getSession = getSession;
function sessionExists(sessionId) {
    return sessions.has(sessionId);
}
exports.sessionExists = sessionExists;
function getSessionStatus(session) {
    // Basic status derived from presence of store and ev
    // More detailed state is tracked in controller via connection.update events
    return (session === null || session === void 0 ? void 0 : session.ev) ? 'active' : 'close';
}
exports.getSessionStatus = getSessionStatus;
async function deleteSession(sessionId) {
    const session = getSession(sessionId);
    await session.destroy();
}
exports.deleteSession = deleteSession;
async function jidExists(session, jid, type = 'number') {
    try {
        if (type === 'group') {
            await session.groupMetadata(jid);
            return true;
        }
        const [result] = await session.onWhatsApp(jid);
        return !!(result === null || result === void 0 ? void 0 : result.exists);
    }
    catch (_a) {
        return false;
    }
}
exports.jidExists = jidExists;
// Build a lightweight knowledge base from QuickReply items relevant to the user's text
async function buildQuickRepliesKB(userText) {
    try {
        const q = String(userText || '').toLowerCase();
        if (!q)
            return null;
        // Extract up to 5 meaningful keywords (length >= 4)
        const tokens = Array.from(new Set(q.split(/[^a-z0-9]+/i).filter(w => w && w.length >= 4))).slice(0, 5);
        let rows = [];
        if (tokens.length) {
            // Build LIKE clauses
            const likes = tokens.map(() => '(`title` LIKE ? OR `text` LIKE ?)').join(' OR ');
            const params = [];
            for (const t of tokens) {
                params.push(`%${t}%`, `%${t}%`);
            }
            rows = await shared_1.prisma.$queryRawUnsafe(`SELECT \`title\`, \`text\` FROM \`QuickReply\` WHERE ${likes} ORDER BY \`updatedAt\` DESC LIMIT 8`, ...params);
        }
        else {
            rows = await shared_1.prisma.$queryRawUnsafe('SELECT `title`, `text` FROM `QuickReply` ORDER BY `updatedAt` DESC LIMIT 5');
        }
        if (!rows || !rows.length)
            return null;
        const clamp = (s, n) => {
            const str = (s !== null && s !== void 0 ? s : '').toString();
            return str.length > n ? str.slice(0, n) + '…' : str;
        };
        const lines = [];
        for (const r of rows) {
            const title = clamp(r.title, 80);
            const body = clamp(r.text, 500);
            lines.push(`- ${title}: ${body}`);
        }
        // Limit total size to ~2k chars
        const out = lines.join('\n');
        return out.length > 2000 ? out.slice(0, 2000) + '…' : out;
    }
    catch (e) {
        try {
            shared_1.logger.warn(e, 'buildQuickRepliesKB failed');
        }
        catch (_a) { }
        return null;
    }
}
