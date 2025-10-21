"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.find = exports.listTable = exports.list = void 0;
const baileys_store_1 = require("@ookamiiixd/baileys-store");
const shared_1 = require("../shared");
const list = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { cursor = undefined, limit = 25 } = req.query;
        const chats = (await shared_1.prisma.chat.findMany({
            cursor: cursor ? { pkId: Number(cursor) } : undefined,
            take: Number(limit),
            skip: cursor ? 1 : 0,
            where: { sessionId },
        })).map((c) => (0, baileys_store_1.serializePrisma)(c));
        res.status(200).json({
            data: chats,
            cursor: chats.length !== 0 && chats.length === Number(limit) ? chats[chats.length - 1].pkId : null,
        });
    }
    catch (e) {
        const message = 'An error occured during chat list';
        shared_1.logger.error(e, message);
        res.status(500).json({ error: message });
    }
};
exports.list = list;
function previewText(msg) {
    var _a, _b, _c, _d, _e;
    try {
        const m = (msg === null || msg === void 0 ? void 0 : msg.message) || {};
        if (m.conversation)
            return m.conversation;
        if ((_a = m.extendedTextMessage) === null || _a === void 0 ? void 0 : _a.text)
            return m.extendedTextMessage.text;
        if ((_b = m.imageMessage) === null || _b === void 0 ? void 0 : _b.caption)
            return m.imageMessage.caption;
        if ((_c = m.videoMessage) === null || _c === void 0 ? void 0 : _c.caption)
            return m.videoMessage.caption;
        if ((_d = m.documentMessage) === null || _d === void 0 ? void 0 : _d.fileName)
            return m.documentMessage.fileName;
        if ((_e = m.protocolMessage) === null || _e === void 0 ? void 0 : _e.type)
            return `protocol: ${m.protocolMessage.type}`;
        if (m.audioMessage)
            return '[audio]';
        if (m.stickerMessage)
            return '[sticker]';
        return Object.keys(m)[0] || '';
    }
    catch (_f) {
        return '';
    }
}
const listTable = async (req, res) => {
    var _a;
    try {
        const { sessionId } = req.params;
        const { cursor = undefined, limit = 25, q } = req.query;
        const chats = await shared_1.prisma.chat.findMany({
            cursor: cursor ? { pkId: Number(cursor) } : undefined,
            take: Number(limit),
            skip: cursor ? 1 : 0,
            where: { sessionId },
            orderBy: { pkId: 'desc' },
        });
        const jids = chats.map((c) => c.id).filter(Boolean);
        const contacts = await shared_1.prisma.contact.findMany({ where: { sessionId, id: { in: jids } } });
        const contactMap = new Map(contacts.map((c) => [c.id, c]));
        const rows = [];
        for (const c of chats) {
            const jid = c.id;
            const contact = contactMap.get(jid);
            const last = await shared_1.prisma.message.findFirst({
                where: { sessionId, remoteJid: jid },
                orderBy: { pkId: 'desc' },
            });
            const name = (_a = ((contact === null || contact === void 0 ? void 0 : contact.name) || (contact === null || contact === void 0 ? void 0 : contact.notify) || (last === null || last === void 0 ? void 0 : last.pushName))) !== null && _a !== void 0 ? _a : null;
            const preview = last ? previewText(last) : '';
            rows.push({ jid, name, preview, pkId: c.pkId });
        }
        // optional search filter by name, jid, or preview
        let filtered = rows;
        if (q && typeof q === 'string' && q.trim()) {
            const term = q.trim().toLowerCase();
            filtered = rows.filter((r) => (r.name || '').toLowerCase().includes(term) || r.jid.toLowerCase().includes(term) || r.preview.toLowerCase().includes(term));
        }
        res.status(200).json({
            rows: filtered,
            cursor: chats.length !== 0 && chats.length === Number(limit) ? chats[chats.length - 1].pkId : null,
        });
    }
    catch (e) {
        const message = 'An error occured during chat table list';
        shared_1.logger.error(e, message);
        res.status(500).json({ error: message });
    }
};
exports.listTable = listTable;
const find = async (req, res) => {
    try {
        const { sessionId, jid } = req.params;
        const { cursor = undefined, limit = 25, direction } = req.query;
        const messages = (await shared_1.prisma.message.findMany({
            cursor: cursor ? { pkId: Number(cursor) } : undefined,
            take: Number(limit),
            skip: cursor ? 1 : 0,
            where: { sessionId, remoteJid: jid },
            orderBy: { pkId: 'desc' },
        })).map((m) => (0, baileys_store_1.serializePrisma)(m));
        const filtered = direction === 'outbox'
            ? messages.filter((m) => {
                var _a, _b, _c;
                const v = (_c = (_b = (_a = m === null || m === void 0 ? void 0 : m.key) === null || _a === void 0 ? void 0 : _a.fromMe) !== null && _b !== void 0 ? _b : m === null || m === void 0 ? void 0 : m.keyFromMe) !== null && _c !== void 0 ? _c : m === null || m === void 0 ? void 0 : m.fromMe;
                if (typeof v === 'boolean')
                    return v;
                if (typeof v === 'number')
                    return v === 1;
                if (typeof v === 'string')
                    return v === 'true' || v === '1';
                return false;
            })
            : direction === 'inbox'
                ? messages.filter((m) => {
                    var _a, _b, _c;
                    const v = (_c = (_b = (_a = m === null || m === void 0 ? void 0 : m.key) === null || _a === void 0 ? void 0 : _a.fromMe) !== null && _b !== void 0 ? _b : m === null || m === void 0 ? void 0 : m.keyFromMe) !== null && _c !== void 0 ? _c : m === null || m === void 0 ? void 0 : m.fromMe;
                    if (typeof v === 'boolean')
                        return !v;
                    if (typeof v === 'number')
                        return v !== 1;
                    if (typeof v === 'string')
                        return !(v === 'true' || v === '1');
                    return true;
                })
                : messages;
        res.status(200).json({
            data: filtered,
            cursor: filtered.length !== 0 && filtered.length === Number(limit)
                ? filtered[filtered.length - 1].pkId
                : null,
        });
    }
    catch (e) {
        const message = 'An error occured during chat find';
        shared_1.logger.error(e, message);
        res.status(500).json({ error: message });
    }
};
exports.find = find;
