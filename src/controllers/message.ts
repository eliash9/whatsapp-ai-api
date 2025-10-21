import { Request, Response } from 'express';
import { downloadMediaMessage as _downloadMediaMessage } from '@adiwajshing/baileys';
import { serializePrisma } from '@ookamiiixd/baileys-store';
import { logger, prisma } from '../shared';
import { delay, parseDataUrl } from '../utils';
import { getSession, jidExists } from '../wa';

export const list = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { cursor = undefined, limit = 25, direction } = req.query as { cursor?: string; limit?: number; direction?: string };
    const messages = (
      await prisma.message.findMany({
        cursor: cursor ? { pkId: Number(cursor) } : undefined,
        take: Number(limit),
        skip: cursor ? 1 : 0,
        where: { sessionId },
        orderBy: { pkId: 'desc' },
      })
    ).map((m) => serializePrisma(m));

    const filtered =
      direction === 'outbox'
        ? messages.filter((m: any) => isFromMe(m) === true)
        : direction === 'inbox'
        ? messages.filter((m: any) => isFromMe(m) === false)
        : messages;

    res.status(200).json({
      data: filtered,
      cursor:
        filtered.length !== 0 && filtered.length === Number(limit)
          ? filtered[filtered.length - 1].pkId
          : null,
    });
  } catch (e) {
    const message = 'An error occured during message list';
    logger.error(e, message);
    res.status(500).json({ error: message });
  }
};

function isFromMe(m: any): boolean {
  // normalize different shapes/encodings of fromMe
  const v = m?.key?.fromMe ?? m?.keyFromMe ?? m?.fromMe;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;
  if (typeof v === 'string') return v === 'true' || v === '1';
  return false;
}

function previewText(msg: any) {
  try {
    const m = msg.message || {};
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

function statusText(v: unknown) {
  const map: Record<string, string> = { '0': 'pending', '1': 'sent', '2': 'delivered', '3': 'read', '4': 'played' };
  if (typeof v === 'number') return map[String(v)] || String(v);
  if (typeof v === 'string') return map[v] || v;
  return '-';
}

export const listTable = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { cursor = undefined, limit = 25, direction, jid, q } = req.query as {
      cursor?: string;
      limit?: number;
      direction?: string;
      jid?: string;
      q?: string;
    };

    const messages = (
      await prisma.message.findMany({
        cursor: cursor ? { pkId: Number(cursor) } : undefined,
        take: Number(limit),
        skip: cursor ? 1 : 0,
        where: Object.assign({ sessionId }, jid ? { remoteJid: jid } : {}),
        orderBy: { pkId: 'desc' },
      })
    ).map((m) => serializePrisma(m));

    let filtered =
      direction === 'outbox'
        ? messages.filter((m: any) => isFromMe(m) === true)
        : direction === 'inbox'
        ? messages.filter((m: any) => isFromMe(m) === false)
        : messages;

    // Text search by pushName, number (peer/remoteJid), or message preview
    if (q && typeof q === 'string' && q.trim().length > 0) {
      const term = q.trim().toLowerCase();
      filtered = filtered.filter((m: any) => {
        const peer = m?.remoteJid || '';
        const name = m?.pushName || '';
        const text = previewText(m) || '';
        return (
          peer.toLowerCase().includes(term) ||
          name.toLowerCase().includes(term) ||
          text.toLowerCase().includes(term)
        );
      });
    }

    const rows = filtered.map((m: any) => {
      const ts = Number(m.messageTimestamp ?? Date.now()) * 1000;
      const peer = m?.key?.fromMe ? m?.remoteJid : m?.key?.participant ?? m?.remoteJid;
      return {
        ts,
        peer,
        pushName: m?.pushName || null,
        text: previewText(m),
        statusText: statusText(m?.status),
        raw: m,
        pkId: m?.pkId,
      };
    });

    res.status(200).json({
      rows,
      cursor:
        filtered.length !== 0 && filtered.length === Number(limit)
          ? filtered[filtered.length - 1].pkId
          : null,
    });
  } catch (e) {
    const message = 'An error occured during message table list';
    logger.error(e, message);
    res.status(500).json({ error: message });
  }
};

export const send = async (req: Request, res: Response) => {
  try {
    const { jid, type = 'number', message, options } = req.body as any;
    const session = getSession(req.params.sessionId);
    const exists = await jidExists(session, jid, type);
    if (!exists) return res.status(400).json({ error: 'JID does not exists' });
    const payload = coerceMediaMessage(message);
    const result = await session.sendMessage(jid, payload, options);
    res.status(200).json(result);
  } catch (e) {
    const message = 'An error occured during message send';
    logger.error(e, message);
    res.status(500).json({ error: message });
  }
};

export const sendBulk = async (req: Request, res: Response) => {
  const session = getSession(req.params.sessionId);
  const results: any[] = [];
  const errors: any[] = [];

  for (const [index, { jid, type = 'number', delay: delayMs = 1000, message, options }] of (
    req.body as any[]
  ).entries()) {
    try {
      const exists = await jidExists(session, jid, type);
      if (!exists) {
        errors.push({ index, error: 'JID does not exists' });
        continue;
      }
      if (index > 0) await delay(delayMs);
      const payload = coerceMediaMessage(message);
      const result = await session.sendMessage(jid, payload, options);
      results.push({ index, result });
    } catch (e) {
      const message = 'An error occured during message send';
      logger.error(e, message);
      errors.push({ index, error: message });
    }
  }

  res
    .status((req.body as any[]).length !== 0 && errors.length === (req.body as any[]).length ? 500 : 200)
    .json({ results, errors });
};

function coerceMediaMessage(message: any) {
  try {
    const content = { ...(message || {}) };
    const fields = ['image', 'video', 'document', 'audio', 'sticker'] as const;
    for (const key of fields) {
      const val = (content as any)[key];
      if (!val) continue;
      // Support string data URL directly
      if (typeof val === 'string') {
        const parsed = parseDataUrl(val);
        if (parsed) {
          (content as any)[key] = parsed.buffer;
          if (key === 'document') (content as any).mimetype = parsed.mimetype;
          continue;
        }
      }
      // Support object with dataUrl/base64
      if (typeof val === 'object') {
        const dataUrl: string | undefined = (val as any).dataUrl;
        const base64: string | undefined = (val as any).base64 || (val as any).data;
        const fileName: string | undefined = (val as any).fileName;
        const mimetype: string | undefined = (val as any).mimetype;
        const caption: string | undefined = (val as any).caption;
        let buffer: Buffer | null = null;
        let mime: string | undefined = mimetype;
        if (dataUrl) {
          const parsed = parseDataUrl(dataUrl);
          if (parsed) {
            buffer = parsed.buffer;
            mime = mime || parsed.mimetype;
          }
        } else if (base64) {
          try { buffer = Buffer.from(base64, 'base64'); } catch {}
        }
        if (buffer) {
          (content as any)[key] = buffer;
          if (caption) (content as any).caption = (content as any).caption || caption;
          // Pass mimetype for media when available (helps Baileys detect type)
          if (mime) (content as any).mimetype = mime;
          if (key === 'document') {
            if (fileName) (content as any).fileName = fileName;
          }
        }
      }
    }
    return content;
  } catch {
    return message;
  }
}

export const download = async (req: Request, res: Response) => {
  try {
    const session = getSession(req.params.sessionId);
    const message = req.body as any;
    const type = Object.keys(message.message)[0];
    const content = message.message[type];
    const buffer = await _downloadMediaMessage(message, 'buffer', {}, {
      logger,
      reuploadRequest: session.updateMediaMessage,
    } as any);
    res.setHeader('Content-Type', content.mimetype);
    res.write(buffer);
    res.end();
  } catch (e) {
    const message = 'An error occured during message media download';
    logger.error(e, message);
    res.status(500).json({ error: message });
  }
};

// Simple stats for overview cards
export const stats = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const nowSec = Math.floor(Date.now() / 1000);
    const dayAgoSec = nowSec - 86_400;

    // We assume outbox messages have a numeric status (0=pending,1=sent,2=delivered,3=read,4=played)
    const sentToday = await prisma.message.count({
      where: { sessionId, status: { gte: 1 }, messageTimestamp: { gte: BigInt(dayAgoSec) } },
    });
    const failedToday = await prisma.message.count({
      // Treat status 0 within last 24h as failed/pending for dashboard purposes
      where: { sessionId, status: 0, messageTimestamp: { gte: BigInt(dayAgoSec) } },
    });
    const queueTotal = await prisma.message.count({ where: { sessionId, status: 0 } });
    const messagesToday = await prisma.message.count({
      where: { sessionId, messageTimestamp: { gte: BigInt(dayAgoSec) } },
    });

    res.status(200).json({ sentToday, failedToday, queueTotal, messagesToday });
  } catch (e) {
    const message = 'An error occured during message stats retrieval';
    logger.error(e, message);
    res.status(500).json({ error: message });
  }
};

// 7-day time series for dashboard chart
export const stats7d = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const days: string[] = [];
    const sent: number[] = [];
    const delivered: number[] = [];
    const failed: number[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const startSec = Math.floor(d.getTime() / 1000);
      const endSec = startSec + 86_400;
      const label = d.toISOString().slice(0, 10); // YYYY-MM-DD
      days.push(label);

      const [s, del, f] = await Promise.all([
        prisma.message.count({ where: { sessionId, status: { gte: 1 }, messageTimestamp: { gte: BigInt(startSec), lt: BigInt(endSec) } } }),
        prisma.message.count({ where: { sessionId, status: { gte: 2 }, messageTimestamp: { gte: BigInt(startSec), lt: BigInt(endSec) } } }),
        prisma.message.count({ where: { sessionId, status: 0, messageTimestamp: { gte: BigInt(startSec), lt: BigInt(endSec) } } }),
      ]);
      sent.push(s);
      delivered.push(del);
      failed.push(f);
    }

    res.status(200).json({ days, series: { sent, delivered, failed } });
  } catch (e) {
    const message = 'An error occured during 7-day stats retrieval';
    logger.error(e, message);
    res.status(500).json({ error: message });
  }
};
