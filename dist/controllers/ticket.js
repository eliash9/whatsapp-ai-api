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
exports.aiSet = exports.aiGet = exports.escalate = exports.remind = exports.remove = exports.clearMessages = exports.close = exports.mediaMeta = exports.media = exports.reply = exports.update = exports.markRead = exports.detail = exports.list = void 0;
const shared_1 = require("../shared");
const wa_1 = require("../wa");
const baileys_1 = require("@adiwajshing/baileys");
const utils_1 = require("../utils");
const AI_DISABLED_TOKEN = '[AI_DISABLED]';
const AI_ENABLED_TOKEN = '[AI_ENABLED]';
const list = async (req, res) => {
    var _a;
    try {
        const { sessionId } = req.params;
        const { cursor = undefined, limit = 25, status, q } = req.query;
        const where = { sessionId };
        if (status && typeof status === 'string')
            where.status = status;
        if (q && typeof q === 'string' && q.trim().length > 0) {
            const term = q.trim();
            where.OR = [
                { customerJid: { contains: term } },
                { subject: { contains: term } },
                { assignedTo: { contains: term } },
            ];
        }
        const rowsRaw = await shared_1.prisma.ticket.findMany({
            cursor: cursor ? { pkId: Number(cursor) } : undefined,
            take: Number(limit),
            skip: cursor ? 1 : 0,
            where,
            orderBy: { pkId: 'desc' },
            include: { messages: { orderBy: { pkId: 'desc' }, take: 1, select: { text: true } } },
        });
        // fetch contacts in batch to get push/display name
        const jids = rowsRaw.map((r) => r.customerJid);
        const contacts = await shared_1.prisma.contact.findMany({ where: { sessionId, id: { in: jids } } });
        const contactMap = new Map(contacts.map((c) => [c.id, c]));
        const rows = [];
        for (const r of rowsRaw) {
            const lastText = (r.messages && r.messages[0] && r.messages[0].text) ? String(r.messages[0].text) : null;
            // determine display name: prefer contact.name/notify/verifiedName, fallback to last message pushName
            let displayName = null;
            try {
                const c = contactMap.get(r.customerJid);
                displayName = (_a = ((c === null || c === void 0 ? void 0 : c.name) || (c === null || c === void 0 ? void 0 : c.notify) || (c === null || c === void 0 ? void 0 : c.verifiedName))) !== null && _a !== void 0 ? _a : null;
                if (!displayName) {
                    const lastMsg = await shared_1.prisma.message.findFirst({ where: { sessionId, remoteJid: r.customerJid }, orderBy: { pkId: 'desc' }, select: { pushName: true } });
                    displayName = (lastMsg === null || lastMsg === void 0 ? void 0 : lastMsg.pushName) || null;
                }
            }
            catch (_b) { }
            // compute unreadCount = count of inbound messages after lastReadPkId (if set),
            // otherwise after last outbound message
            let unreadCount = 0;
            try {
                const sincePk = r.lastReadPkId || 0;
                if (sincePk) {
                    unreadCount = await shared_1.prisma.ticketMessage.count({ where: { ticketId: r.pkId, direction: 'in', pkId: { gt: sincePk } } });
                }
                else {
                    const lastOut = await shared_1.prisma.ticketMessage.findFirst({ where: { ticketId: r.pkId, direction: 'out' }, orderBy: { pkId: 'desc' }, select: { pkId: true } });
                    const sincePk2 = (lastOut === null || lastOut === void 0 ? void 0 : lastOut.pkId) || 0;
                    unreadCount = await shared_1.prisma.ticketMessage.count({ where: { ticketId: r.pkId, direction: 'in', pkId: { gt: sincePk2 } } });
                }
            }
            catch (_c) { }
            const { messages } = r, rest = __rest(r, ["messages"]);
            rows.push(Object.assign(Object.assign({}, rest), { lastText, unreadCount, displayName }));
        }
        res.status(200).json({
            data: rows,
            cursor: rows.length !== 0 && rows.length === Number(limit) ? rows[rows.length - 1].pkId : null,
        });
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to list tickets' });
    }
};
exports.list = list;
const detail = async (req, res) => {
    try {
        const { sessionId, id } = req.params;
        const data = await shared_1.prisma.ticket.findFirst({
            where: { pkId: Number(id), sessionId },
            include: { messages: { orderBy: { pkId: 'asc' } } },
        });
        if (!data)
            return res.status(404).json({ error: 'Ticket not found' });
        res.status(200).json({ data });
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to get ticket detail' });
    }
};
exports.detail = detail;
const markRead = async (req, res) => {
    try {
        const { sessionId, id } = req.params;
        const t = await shared_1.prisma.ticket.findFirst({ where: { pkId: Number(id), sessionId } });
        if (!t)
            return res.status(404).json({ error: 'Ticket not found' });
        const lastInbound = await shared_1.prisma.ticketMessage.findFirst({ where: { ticketId: t.pkId, direction: 'in' }, orderBy: { pkId: 'desc' }, select: { pkId: true } });
        const lastPk = (lastInbound === null || lastInbound === void 0 ? void 0 : lastInbound.pkId) || null;
        if (!lastPk)
            return res.status(200).json({ ok: true, lastReadPkId: t.lastReadPkId || null });
        const updated = await shared_1.prisma.ticket.update({ where: { pkId: t.pkId }, data: { lastReadPkId: lastPk } });
        res.status(200).json({ ok: true, lastReadPkId: updated.lastReadPkId || null });
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to mark ticket as read' });
    }
};
exports.markRead = markRead;
const update = async (req, res) => {
    try {
        const { sessionId, id } = req.params;
        const { status, subject, priority, assignedTo, slaDueAt } = req.body || {};
        const data = await shared_1.prisma.ticket.update({
            where: { pkId: Number(id) },
            data: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, (status ? { status: String(status) } : {})), (subject ? { subject: String(subject) } : {})), (priority ? { priority: String(priority) } : {})), (assignedTo ? { assignedTo: String(assignedTo) } : {})), (slaDueAt ? { slaDueAt: new Date(slaDueAt) } : {})),
        });
        res.status(200).json({ data });
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to update ticket' });
    }
};
exports.update = update;
const reply = async (req, res) => {
    var _a;
    try {
        const { sessionId, id } = req.params;
        const { text, assignedTo, image, video, document } = req.body || {};
        if (!text && !image && !video && !document)
            return res.status(400).json({ error: 'text or media is required' });
        const t = await shared_1.prisma.ticket.findFirst({ where: { pkId: Number(id), sessionId } });
        if (!t)
            return res.status(404).json({ error: 'Ticket not found' });
        const session = (0, wa_1.getSession)(sessionId);
        // Build payload (support image/video/document via dataUrl/base64)
        const payload = {};
        if (text)
            payload.text = String(text);
        const attach = async (key, val) => {
            if (!val)
                return;
            if (typeof val === 'string') {
                const parsed = (0, utils_1.parseDataUrl)(val);
                if (parsed) {
                    payload[key] = parsed.buffer;
                    if (key === 'document')
                        payload.mimetype = parsed.mimetype;
                }
            }
            else if (typeof val === 'object') {
                const dataUrl = val.dataUrl;
                const base64 = val.base64 || val.data;
                const fileName = val.fileName;
                const mimetype = val.mimetype;
                const caption = val.caption;
                let buffer = null;
                let mime = mimetype;
                if (dataUrl) {
                    const parsed = (0, utils_1.parseDataUrl)(dataUrl);
                    if (parsed) {
                        buffer = parsed.buffer;
                        mime = mime || parsed.mimetype;
                    }
                }
                else if (base64) {
                    try {
                        buffer = Buffer.from(base64, 'base64');
                    }
                    catch (_a) { }
                }
                if (buffer) {
                    payload[key] = buffer;
                    if (caption)
                        payload.caption = payload.caption || caption;
                    if (mime)
                        payload.mimetype = mime;
                    if (key === 'document' && fileName)
                        payload.fileName = fileName;
                }
            }
        };
        await attach('image', image);
        await attach('video', video);
        await attach('document', document);
        // Normalize destination JID to user form (avoid LID)
        const toJid = (0, baileys_1.jidNormalizedUser)(String(t.customerJid || ''));
        // Persist normalized customerJid if different (helps future sends)
        try {
            if (toJid && toJid !== t.customerJid)
                await shared_1.prisma.ticket.update({ where: { pkId: t.pkId }, data: { customerJid: toJid } });
        }
        catch (_b) { }
        const result = await session.sendMessage(toJid, payload);
        // Try to link to stored message in DB
        let messagePkId = undefined;
        try {
            const key = (_a = result === null || result === void 0 ? void 0 : result.key) === null || _a === void 0 ? void 0 : _a.id;
            const remoteJid = t.customerJid;
            if (key) {
                const saved = await shared_1.prisma.message.findUnique({ where: { sessionId_remoteJid_id: { sessionId, remoteJid, id: String(key) } } });
                if (saved)
                    messagePkId = saved.pkId;
            }
        }
        catch (_c) { }
        const placeholder = image ? '[image]' : video ? '[video]' : document ? '[document]' : undefined;
        const savedMsg = await shared_1.prisma.ticketMessage.create({
            data: { ticketId: t.pkId, direction: 'out', text: String(payload.caption || payload.text || placeholder || ''), messagePkId },
        });
        const nextStatus = t.status === 'open' || t.status === 'assigned' ? 'in_progress' : t.status;
        await shared_1.prisma.ticket.update({ where: { pkId: t.pkId }, data: Object.assign({ lastMessageAt: new Date(), status: nextStatus }, (assignedTo ? { assignedTo: String(assignedTo) } : {})) });
        res.status(200).json({ data: savedMsg });
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to send reply' });
    }
};
exports.reply = reply;
const media = async (req, res) => {
    try {
        const { sessionId, id, messagePkId } = req.params;
        // validate ticket existence minimally
        const t = await shared_1.prisma.ticket.findFirst({ where: { pkId: Number(id), sessionId } });
        if (!t)
            return res.status(404).json({ error: 'Ticket not found' });
        const row = await shared_1.prisma.message.findUnique({ where: { pkId: Number(messagePkId) } });
        if (!(row === null || row === void 0 ? void 0 : row.message))
            return res.status(404).json({ error: 'Message not found' });
        const session = (0, wa_1.getSession)(sessionId);
        const message = { key: row.key, message: row.message };
        const type = Object.keys(message.message || {})[0];
        const content = message.message[type];
        // Reimplement download logic locally
        const _download = (await Promise.resolve().then(() => __importStar(require('@adiwajshing/baileys')))).downloadMediaMessage;
        const data = await _download(message, 'buffer', {}, { logger: (await Promise.resolve().then(() => __importStar(require('../shared')))).logger, reuploadRequest: (0, wa_1.getSession)(sessionId).updateMediaMessage });
        res.setHeader('Content-Type', content.mimetype || 'application/octet-stream');
        res.write(data);
        res.end();
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to fetch media' });
    }
};
exports.media = media;
const mediaMeta = async (req, res) => {
    try {
        const { sessionId, id, messagePkId } = req.params;
        const t = await shared_1.prisma.ticket.findFirst({ where: { pkId: Number(id), sessionId } });
        if (!t)
            return res.status(404).json({ error: 'Ticket not found' });
        const row = await shared_1.prisma.message.findUnique({ where: { pkId: Number(messagePkId) } });
        if (!(row === null || row === void 0 ? void 0 : row.message))
            return res.status(404).json({ error: 'Message not found' });
        const msg = row.message || {};
        const type = Object.keys(msg)[0] || '';
        const content = msg[type] || {};
        const mimetype = content.mimetype || '';
        // normalize image/video detection
        let baseType = '';
        if (mimetype.startsWith('image/'))
            baseType = 'image';
        else if (mimetype.startsWith('video/'))
            baseType = 'video';
        else
            baseType = type.replace('Message', '').toLowerCase();
        res.status(200).json({ type: mimetype || baseType });
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to get media meta' });
    }
};
exports.mediaMeta = mediaMeta;
const close = async (req, res) => {
    try {
        const { sessionId, id } = req.params;
        const t = await shared_1.prisma.ticket.findFirst({ where: { pkId: Number(id), sessionId } });
        if (!t)
            return res.status(404).json({ error: 'Ticket not found' });
        const data = await shared_1.prisma.ticket.update({ where: { pkId: t.pkId }, data: { status: 'closed' } });
        res.status(200).json({ data });
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to close ticket' });
    }
};
exports.close = close;
// Delete all TicketMessage rows for a ticket; only allowed when status is 'closed'
const clearMessages = async (req, res) => {
    try {
        const { sessionId, id } = req.params;
        const t = await shared_1.prisma.ticket.findFirst({ where: { pkId: Number(id), sessionId } });
        if (!t)
            return res.status(404).json({ error: 'Ticket not found' });
        if ((t.status || '').toLowerCase() !== 'closed')
            return res.status(400).json({ error: 'Ticket must be closed to clear messages' });
        await shared_1.prisma.ticketMessage.deleteMany({ where: { ticketId: t.pkId } });
        await shared_1.prisma.ticket.update({ where: { pkId: t.pkId }, data: { lastMessageAt: null, lastReadPkId: null } });
        res.status(200).json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to clear messages' });
    }
};
exports.clearMessages = clearMessages;
// Permanently delete a ticket; only allowed when status is 'closed'
const remove = async (req, res) => {
    try {
        const { sessionId, id } = req.params;
        const t = await shared_1.prisma.ticket.findFirst({ where: { pkId: Number(id), sessionId } });
        if (!t)
            return res.status(404).json({ error: 'Ticket not found' });
        if ((t.status || '').toLowerCase() !== 'closed')
            return res.status(400).json({ error: 'Ticket must be closed to delete' });
        await shared_1.prisma.ticket.delete({ where: { pkId: t.pkId } });
        res.status(200).json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to delete ticket' });
    }
};
exports.remove = remove;
const remind = async (req, res) => {
    try {
        const { sessionId, id } = req.params;
        const t = await shared_1.prisma.ticket.findFirst({ where: { pkId: Number(id), sessionId } });
        if (!t)
            return res.status(404).json({ error: 'Ticket not found' });
        await shared_1.prisma.ticketMessage.create({ data: { ticketId: t.pkId, direction: 'out', text: '[SYSTEM] Reminder sent' } });
        res.status(200).json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to send reminder' });
    }
};
exports.remind = remind;
const escalate = async (req, res) => {
    try {
        const { sessionId, id } = req.params;
        const t = await shared_1.prisma.ticket.findFirst({ where: { pkId: Number(id), sessionId } });
        if (!t)
            return res.status(404).json({ error: 'Ticket not found' });
        const data = await shared_1.prisma.ticket.update({ where: { pkId: t.pkId }, data: { status: 'escalated', priority: t.priority || 'urgent' } });
        await shared_1.prisma.ticketMessage.create({ data: { ticketId: t.pkId, direction: 'out', text: '[SYSTEM] Manually escalated' } });
        res.status(200).json({ data });
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to escalate ticket' });
    }
};
exports.escalate = escalate;
const aiGet = async (req, res) => {
    try {
        const { sessionId, id } = req.params;
        const t = await shared_1.prisma.ticket.findFirst({ where: { pkId: Number(id), sessionId } });
        if (!t)
            return res.status(404).json({ error: 'Ticket not found' });
        const lastToggle = await shared_1.prisma.ticketMessage.findFirst({
            where: { ticketId: t.pkId, OR: [{ text: AI_DISABLED_TOKEN }, { text: AI_ENABLED_TOKEN }] },
            orderBy: { pkId: 'desc' },
        });
        const enabled = lastToggle ? lastToggle.text === AI_ENABLED_TOKEN : true;
        res.status(200).json({ enabled });
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to get AI status' });
    }
};
exports.aiGet = aiGet;
const aiSet = async (req, res) => {
    try {
        const { sessionId, id } = req.params;
        const { enabled } = req.body;
        const t = await shared_1.prisma.ticket.findFirst({ where: { pkId: Number(id), sessionId } });
        if (!t)
            return res.status(404).json({ error: 'Ticket not found' });
        await shared_1.prisma.ticketMessage.create({ data: { ticketId: t.pkId, direction: 'out', text: enabled ? AI_ENABLED_TOKEN : AI_DISABLED_TOKEN } });
        res.status(200).json({ enabled });
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to set AI status' });
    }
};
exports.aiSet = aiSet;
