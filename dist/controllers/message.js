"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stats7d = exports.stats = exports.download = exports.sendBulk = exports.send = exports.listTable = exports.list = void 0;
const baileys_1 = require("@adiwajshing/baileys");
const baileys_store_1 = require("@ookamiiixd/baileys-store");
const shared_1 = require("../shared");
const utils_1 = require("../utils");
const wa_1 = require("../wa");
const list = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { cursor = undefined, limit = 25, direction } = req.query;
        const messages = (await shared_1.prisma.message.findMany({
            cursor: cursor ? { pkId: Number(cursor) } : undefined,
            take: Number(limit),
            skip: cursor ? 1 : 0,
            where: { sessionId },
            orderBy: { pkId: 'desc' },
        })).map((m) => (0, baileys_store_1.serializePrisma)(m));
        const filtered = direction === 'outbox'
            ? messages.filter((m) => isFromMe(m) === true)
            : direction === 'inbox'
                ? messages.filter((m) => isFromMe(m) === false)
                : messages;
        res.status(200).json({
            data: filtered,
            cursor: filtered.length !== 0 && filtered.length === Number(limit)
                ? filtered[filtered.length - 1].pkId
                : null,
        });
    }
    catch (e) {
        const message = 'An error occured during message list';
        shared_1.logger.error(e, message);
        res.status(500).json({ error: message });
    }
};
exports.list = list;
function isFromMe(m) {
    var _a, _b, _c;
    // normalize different shapes/encodings of fromMe
    const v = (_c = (_b = (_a = m === null || m === void 0 ? void 0 : m.key) === null || _a === void 0 ? void 0 : _a.fromMe) !== null && _b !== void 0 ? _b : m === null || m === void 0 ? void 0 : m.keyFromMe) !== null && _c !== void 0 ? _c : m === null || m === void 0 ? void 0 : m.fromMe;
    if (typeof v === 'boolean')
        return v;
    if (typeof v === 'number')
        return v === 1;
    if (typeof v === 'string')
        return v === 'true' || v === '1';
    return false;
}
function previewText(msg) {
    var _a, _b, _c, _d, _e;
    try {
        const m = msg.message || {};
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
function statusText(v) {
    const map = { '0': 'pending', '1': 'sent', '2': 'delivered', '3': 'read', '4': 'played' };
    if (typeof v === 'number')
        return map[String(v)] || String(v);
    if (typeof v === 'string')
        return map[v] || v;
    return '-';
}
const listTable = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { cursor = undefined, limit = 25, direction, jid, q } = req.query;
        const messages = (await shared_1.prisma.message.findMany({
            cursor: cursor ? { pkId: Number(cursor) } : undefined,
            take: Number(limit),
            skip: cursor ? 1 : 0,
            where: Object.assign({ sessionId }, jid ? { remoteJid: jid } : {}),
            orderBy: { pkId: 'desc' },
        })).map((m) => (0, baileys_store_1.serializePrisma)(m));
        let filtered = direction === 'outbox'
            ? messages.filter((m) => isFromMe(m) === true)
            : direction === 'inbox'
                ? messages.filter((m) => isFromMe(m) === false)
                : messages;
        // Text search by pushName, number (peer/remoteJid), or message preview
        if (q && typeof q === 'string' && q.trim().length > 0) {
            const term = q.trim().toLowerCase();
            filtered = filtered.filter((m) => {
                const peer = (m === null || m === void 0 ? void 0 : m.remoteJid) || '';
                const name = (m === null || m === void 0 ? void 0 : m.pushName) || '';
                const text = previewText(m) || '';
                return (peer.toLowerCase().includes(term) ||
                    name.toLowerCase().includes(term) ||
                    text.toLowerCase().includes(term));
            });
        }
        const rows = filtered.map((m) => {
            var _a, _b, _c, _d;
            const ts = Number((_a = m.messageTimestamp) !== null && _a !== void 0 ? _a : Date.now()) * 1000;
            const peer = ((_b = m === null || m === void 0 ? void 0 : m.key) === null || _b === void 0 ? void 0 : _b.fromMe) ? m === null || m === void 0 ? void 0 : m.remoteJid : (_d = (_c = m === null || m === void 0 ? void 0 : m.key) === null || _c === void 0 ? void 0 : _c.participant) !== null && _d !== void 0 ? _d : m === null || m === void 0 ? void 0 : m.remoteJid;
            return {
                ts,
                peer,
                pushName: (m === null || m === void 0 ? void 0 : m.pushName) || null,
                text: previewText(m),
                statusText: statusText(m === null || m === void 0 ? void 0 : m.status),
                raw: m,
                pkId: m === null || m === void 0 ? void 0 : m.pkId,
            };
        });
        res.status(200).json({
            rows,
            cursor: filtered.length !== 0 && filtered.length === Number(limit)
                ? filtered[filtered.length - 1].pkId
                : null,
        });
    }
    catch (e) {
        const message = 'An error occured during message table list';
        shared_1.logger.error(e, message);
        res.status(500).json({ error: message });
    }
};
exports.listTable = listTable;
const send = async (req, res) => {
    try {
        const { jid, type = 'number', message, options } = req.body;
        const session = (0, wa_1.getSession)(req.params.sessionId);
        const exists = await (0, wa_1.jidExists)(session, jid, type);
        if (!exists)
            return res.status(400).json({ error: 'JID does not exists' });
        const payload = coerceMediaMessage(message);
        const result = await session.sendMessage(jid, payload, options);
        res.status(200).json(result);
    }
    catch (e) {
        const message = 'An error occured during message send';
        shared_1.logger.error(e, message);
        res.status(500).json({ error: message });
    }
};
exports.send = send;
const sendBulk = async (req, res) => {
    const session = (0, wa_1.getSession)(req.params.sessionId);
    const results = [];
    const errors = [];
    for (const [index, { jid, type = 'number', delay: delayMs = 1000, message, options }] of req.body.entries()) {
        try {
            const exists = await (0, wa_1.jidExists)(session, jid, type);
            if (!exists) {
                errors.push({ index, error: 'JID does not exists' });
                continue;
            }
            if (index > 0)
                await (0, utils_1.delay)(delayMs);
            const payload = coerceMediaMessage(message);
            const result = await session.sendMessage(jid, payload, options);
            results.push({ index, result });
        }
        catch (e) {
            const message = 'An error occured during message send';
            shared_1.logger.error(e, message);
            errors.push({ index, error: message });
        }
    }
    res
        .status(req.body.length !== 0 && errors.length === req.body.length ? 500 : 200)
        .json({ results, errors });
};
exports.sendBulk = sendBulk;
function coerceMediaMessage(message) {
    try {
        const content = Object.assign({}, (message || {}));
        const fields = ['image', 'video', 'document', 'audio', 'sticker'];
        for (const key of fields) {
            const val = content[key];
            if (!val)
                continue;
            // Support string data URL directly
            if (typeof val === 'string') {
                const parsed = (0, utils_1.parseDataUrl)(val);
                if (parsed) {
                    content[key] = parsed.buffer;
                    if (key === 'document')
                        content.mimetype = parsed.mimetype;
                    continue;
                }
            }
            // Support object with dataUrl/base64
            if (typeof val === 'object') {
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
                    content[key] = buffer;
                    if (caption)
                        content.caption = content.caption || caption;
                    // Pass mimetype for media when available (helps Baileys detect type)
                    if (mime)
                        content.mimetype = mime;
                    if (key === 'document') {
                        if (fileName)
                            content.fileName = fileName;
                    }
                }
            }
        }
        return content;
    }
    catch (_b) {
        return message;
    }
}
const download = async (req, res) => {
    try {
        const session = (0, wa_1.getSession)(req.params.sessionId);
        const message = req.body;
        const type = Object.keys(message.message)[0];
        const content = message.message[type];
        const buffer = await (0, baileys_1.downloadMediaMessage)(message, 'buffer', {}, {
            logger: shared_1.logger,
            reuploadRequest: session.updateMediaMessage,
        });
        res.setHeader('Content-Type', content.mimetype);
        res.write(buffer);
        res.end();
    }
    catch (e) {
        const message = 'An error occured during message media download';
        shared_1.logger.error(e, message);
        res.status(500).json({ error: message });
    }
};
exports.download = download;
// Simple stats for overview cards
const stats = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const nowSec = Math.floor(Date.now() / 1000);
        const dayAgoSec = nowSec - 86400;
        // We assume outbox messages have a numeric status (0=pending,1=sent,2=delivered,3=read,4=played)
        const sentToday = await shared_1.prisma.message.count({
            where: { sessionId, status: { gte: 1 }, messageTimestamp: { gte: BigInt(dayAgoSec) } },
        });
        const failedToday = await shared_1.prisma.message.count({
            // Treat status 0 within last 24h as failed/pending for dashboard purposes
            where: { sessionId, status: 0, messageTimestamp: { gte: BigInt(dayAgoSec) } },
        });
        const queueTotal = await shared_1.prisma.message.count({ where: { sessionId, status: 0 } });
        const messagesToday = await shared_1.prisma.message.count({
            where: { sessionId, messageTimestamp: { gte: BigInt(dayAgoSec) } },
        });
        res.status(200).json({ sentToday, failedToday, queueTotal, messagesToday });
    }
    catch (e) {
        const message = 'An error occured during message stats retrieval';
        shared_1.logger.error(e, message);
        res.status(500).json({ error: message });
    }
};
exports.stats = stats;
// 7-day time series for dashboard chart
const stats7d = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const days = [];
        const sent = [];
        const delivered = [];
        const failed = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            d.setDate(d.getDate() - i);
            const startSec = Math.floor(d.getTime() / 1000);
            const endSec = startSec + 86400;
            const label = d.toISOString().slice(0, 10); // YYYY-MM-DD
            days.push(label);
            const [s, del, f] = await Promise.all([
                shared_1.prisma.message.count({ where: { sessionId, status: { gte: 1 }, messageTimestamp: { gte: BigInt(startSec), lt: BigInt(endSec) } } }),
                shared_1.prisma.message.count({ where: { sessionId, status: { gte: 2 }, messageTimestamp: { gte: BigInt(startSec), lt: BigInt(endSec) } } }),
                shared_1.prisma.message.count({ where: { sessionId, status: 0, messageTimestamp: { gte: BigInt(startSec), lt: BigInt(endSec) } } }),
            ]);
            sent.push(s);
            delivered.push(del);
            failed.push(f);
        }
        res.status(200).json({ days, series: { sent, delivered, failed } });
    }
    catch (e) {
        const message = 'An error occured during 7-day stats retrieval';
        shared_1.logger.error(e, message);
        res.status(500).json({ error: message });
    }
};
exports.stats7d = stats7d;
