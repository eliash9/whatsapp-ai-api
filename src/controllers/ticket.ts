import { Request, Response } from 'express';
import { prisma } from '../shared';
import { getSession } from '../wa';
import { jidNormalizedUser } from '@adiwajshing/baileys';
import { parseDataUrl } from '../utils';

const AI_DISABLED_TOKEN = '[AI_DISABLED]';
const AI_ENABLED_TOKEN = '[AI_ENABLED]';

export const list = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { cursor = undefined, limit = 25, status, q } = req.query as any;
    const where: any = { sessionId };
    if (status && typeof status === 'string') where.status = status;
    if (q && typeof q === 'string' && q.trim().length > 0) {
      const term = q.trim();
      where.OR = [
        { customerJid: { contains: term } },
        { subject: { contains: term } },
        { assignedTo: { contains: term } },
      ];
    }
    const rowsRaw = await prisma.ticket.findMany({
      cursor: cursor ? { pkId: Number(cursor) } : undefined,
      take: Number(limit),
      skip: cursor ? 1 : 0,
      where,
      orderBy: { pkId: 'desc' },
      include: { messages: { orderBy: { pkId: 'desc' }, take: 1, select: { text: true } } },
    });
    // fetch contacts in batch to get push/display name
    const jids = (rowsRaw as any[]).map((r) => r.customerJid);
    const contacts = await prisma.contact.findMany({ where: { sessionId, id: { in: jids } } });
    const contactMap = new Map(contacts.map((c) => [c.id, c]));

    const rows = [] as any[];
    for (const r of rowsRaw as any[]) {
      const lastText = (r.messages && r.messages[0] && r.messages[0].text) ? String(r.messages[0].text) : null;
      // determine display name: prefer contact.name/notify/verifiedName, fallback to last message pushName
      let displayName: string | null = null;
      try {
        const c = contactMap.get(r.customerJid) as any;
        displayName = (c?.name || c?.notify || c?.verifiedName) ?? null;
        if (!displayName) {
          const lastMsg = await prisma.message.findFirst({ where: { sessionId, remoteJid: r.customerJid }, orderBy: { pkId: 'desc' }, select: { pushName: true } });
          displayName = (lastMsg?.pushName as any) || null;
        }
      } catch {}
      // compute unreadCount = count of inbound messages after lastReadPkId (if set),
      // otherwise after last outbound message
      let unreadCount = 0;
      try {
        const sincePk = (r as any).lastReadPkId || 0;
        if (sincePk) {
          unreadCount = await prisma.ticketMessage.count({ where: { ticketId: r.pkId, direction: 'in', pkId: { gt: sincePk } } });
        } else {
          const lastOut = await prisma.ticketMessage.findFirst({ where: { ticketId: r.pkId, direction: 'out' }, orderBy: { pkId: 'desc' }, select: { pkId: true } });
          const sincePk2 = lastOut?.pkId || 0;
          unreadCount = await prisma.ticketMessage.count({ where: { ticketId: r.pkId, direction: 'in', pkId: { gt: sincePk2 } } });
        }
      } catch {}
      const { messages, ...rest } = r;
      rows.push({ ...rest, lastText, unreadCount, displayName });
    }
    res.status(200).json({
      data: rows,
      cursor: rows.length !== 0 && rows.length === Number(limit) ? rows[rows.length - 1].pkId : null,
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to list tickets' });
  }
};

export const detail = async (req: Request, res: Response) => {
  try {
    const { sessionId, id } = req.params as any;
    const data = await prisma.ticket.findFirst({
      where: { pkId: Number(id), sessionId },
      include: { messages: { orderBy: { pkId: 'asc' } } },
    });
    if (!data) return res.status(404).json({ error: 'Ticket not found' });
    res.status(200).json({ data });
  } catch (e) {
    res.status(500).json({ error: 'Failed to get ticket detail' });
  }
};

export const markRead = async (req: Request, res: Response) => {
  try {
    const { sessionId, id } = req.params as any;
    const t = await prisma.ticket.findFirst({ where: { pkId: Number(id), sessionId } });
    if (!t) return res.status(404).json({ error: 'Ticket not found' });
    const lastInbound = await prisma.ticketMessage.findFirst({ where: { ticketId: t.pkId, direction: 'in' }, orderBy: { pkId: 'desc' }, select: { pkId: true } });
    const lastPk = lastInbound?.pkId || null;
    if (!lastPk) return res.status(200).json({ ok: true, lastReadPkId: t.lastReadPkId || null });
    const updated = await prisma.ticket.update({ where: { pkId: t.pkId }, data: { lastReadPkId: lastPk } });
    res.status(200).json({ ok: true, lastReadPkId: updated.lastReadPkId || null });
  } catch (e) {
    res.status(500).json({ error: 'Failed to mark ticket as read' });
  }
};

export const update = async (req: Request, res: Response) => {
  try {
    const { sessionId, id } = req.params as any;
    const { status, subject, priority, assignedTo, slaDueAt } = req.body || {};
    const data = await prisma.ticket.update({
      where: { pkId: Number(id) },
      data: {
        ...(status ? { status: String(status) } : {}),
        ...(subject ? { subject: String(subject) } : {}),
        ...(priority ? { priority: String(priority) } : {}),
        ...(assignedTo ? { assignedTo: String(assignedTo) } : {}),
        ...(slaDueAt ? { slaDueAt: new Date(slaDueAt) } : {}),
      },
    });
    res.status(200).json({ data });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update ticket' });
  }
};

export const reply = async (req: Request, res: Response) => {
  try {
    const { sessionId, id } = req.params as any;
    const { text, assignedTo, image, video, document } = req.body || {};
    if (!text && !image && !video && !document) return res.status(400).json({ error: 'text or media is required' });
    const t = await prisma.ticket.findFirst({ where: { pkId: Number(id), sessionId } });
    if (!t) return res.status(404).json({ error: 'Ticket not found' });
    const session = getSession(sessionId);

    // Build payload (support image/video/document via dataUrl/base64)
    const payload: any = {};
    if (text) payload.text = String(text);
    const attach = async (key: 'image' | 'video' | 'document', val: any) => {
      if (!val) return;
      if (typeof val === 'string') {
        const parsed = parseDataUrl(val);
        if (parsed) {
          payload[key] = parsed.buffer;
          if (key === 'document') payload.mimetype = parsed.mimetype;
        }
      } else if (typeof val === 'object') {
        const dataUrl: string | undefined = val.dataUrl;
        const base64: string | undefined = val.base64 || val.data;
        const fileName: string | undefined = val.fileName;
        const mimetype: string | undefined = val.mimetype;
        const caption: string | undefined = val.caption;
        let buffer: Buffer | null = null;
        let mime = mimetype;
        if (dataUrl) {
          const parsed = parseDataUrl(dataUrl);
          if (parsed) { buffer = parsed.buffer; mime = mime || parsed.mimetype; }
        } else if (base64) {
          try { buffer = Buffer.from(base64, 'base64'); } catch {}
        }
        if (buffer) {
          payload[key] = buffer;
          if (caption) payload.caption = payload.caption || caption;
          if (mime) payload.mimetype = mime;
          if (key === 'document' && fileName) payload.fileName = fileName;
        }
      }
    };
    await attach('image', image);
    await attach('video', video);
    await attach('document', document);

    // Normalize destination JID to user form (avoid LID)
    const toJid = jidNormalizedUser(String(t.customerJid || ''));
    // Persist normalized customerJid if different (helps future sends)
    try { if (toJid && toJid !== t.customerJid) await prisma.ticket.update({ where: { pkId: t.pkId }, data: { customerJid: toJid } }); } catch {}
    const result: any = await session.sendMessage(toJid, payload);

    // Try to link to stored message in DB
    let messagePkId: number | undefined = undefined;
    try {
      const key = result?.key?.id;
      const remoteJid: string = t.customerJid;
      if (key) {
        const saved = await prisma.message.findUnique({ where: { sessionId_remoteJid_id: { sessionId, remoteJid, id: String(key) } } as any });
        if (saved) messagePkId = saved.pkId;
      }
    } catch {}

    const placeholder = image ? '[image]' : video ? '[video]' : document ? '[document]' : undefined;
    const savedMsg = await prisma.ticketMessage.create({
      data: { ticketId: t.pkId, direction: 'out', text: String(payload.caption || payload.text || placeholder || ''), messagePkId },
    });
    const nextStatus = t.status === 'open' || t.status === 'assigned' ? 'in_progress' : t.status;
    await prisma.ticket.update({ where: { pkId: t.pkId }, data: { lastMessageAt: new Date(), status: nextStatus, ...(assignedTo ? { assignedTo: String(assignedTo) } : {}) } });
    res.status(200).json({ data: savedMsg });
  } catch (e) {
    res.status(500).json({ error: 'Failed to send reply' });
  }
};

export const media = async (req: Request, res: Response) => {
  try {
    const { sessionId, id, messagePkId } = req.params as any;
    // validate ticket existence minimally
    const t = await prisma.ticket.findFirst({ where: { pkId: Number(id), sessionId } });
    if (!t) return res.status(404).json({ error: 'Ticket not found' });
    const row = await prisma.message.findUnique({ where: { pkId: Number(messagePkId) } });
    if (!row?.message) return res.status(404).json({ error: 'Message not found' });
    const session = getSession(sessionId);
    const message: any = { key: row.key, message: row.message };
    const type = Object.keys(message.message || {})[0];
    const content = message.message[type];
    // Reimplement download logic locally
    const _download = (await import('@adiwajshing/baileys')).downloadMediaMessage;
    const data = await _download(message, 'buffer', {}, { logger: (await import('../shared')).logger as any, reuploadRequest: (getSession(sessionId) as any).updateMediaMessage } as any);
    res.setHeader('Content-Type', content.mimetype || 'application/octet-stream');
    res.write(data);
    res.end();
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch media' });
  }
};

export const mediaMeta = async (req: Request, res: Response) => {
  try {
    const { sessionId, id, messagePkId } = req.params as any;
    const t = await prisma.ticket.findFirst({ where: { pkId: Number(id), sessionId } });
    if (!t) return res.status(404).json({ error: 'Ticket not found' });
    const row = await prisma.message.findUnique({ where: { pkId: Number(messagePkId) } });
    if (!row?.message) return res.status(404).json({ error: 'Message not found' });
    const msg: any = row.message || {};
    const type = Object.keys(msg)[0] || '';
    const content = (msg as any)[type] || {};
    const mimetype = content.mimetype || '';
    // normalize image/video detection
    let baseType = '';
    if (mimetype.startsWith('image/')) baseType = 'image';
    else if (mimetype.startsWith('video/')) baseType = 'video';
    else baseType = type.replace('Message','').toLowerCase();
    res.status(200).json({ type: mimetype || baseType });
  } catch (e) {
    res.status(500).json({ error: 'Failed to get media meta' });
  }
};

export const close = async (req: Request, res: Response) => {
  try {
    const { sessionId, id } = req.params as any;
    const t = await prisma.ticket.findFirst({ where: { pkId: Number(id), sessionId } });
    if (!t) return res.status(404).json({ error: 'Ticket not found' });
    const data = await prisma.ticket.update({ where: { pkId: t.pkId }, data: { status: 'closed' } });
    res.status(200).json({ data });
  } catch (e) {
    res.status(500).json({ error: 'Failed to close ticket' });
  }
};

// Delete all TicketMessage rows for a ticket; only allowed when status is 'closed'
export const clearMessages = async (req: Request, res: Response) => {
  try {
    const { sessionId, id } = req.params as any;
    const t = await prisma.ticket.findFirst({ where: { pkId: Number(id), sessionId } });
    if (!t) return res.status(404).json({ error: 'Ticket not found' });
    if ((t.status || '').toLowerCase() !== 'closed') return res.status(400).json({ error: 'Ticket must be closed to clear messages' });
    await prisma.ticketMessage.deleteMany({ where: { ticketId: t.pkId } });
    await prisma.ticket.update({ where: { pkId: t.pkId }, data: { lastMessageAt: null, lastReadPkId: null } });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to clear messages' });
  }
};

// Permanently delete a ticket; only allowed when status is 'closed'
export const remove = async (req: Request, res: Response) => {
  try {
    const { sessionId, id } = req.params as any;
    const t = await prisma.ticket.findFirst({ where: { pkId: Number(id), sessionId } });
    if (!t) return res.status(404).json({ error: 'Ticket not found' });
    if ((t.status || '').toLowerCase() !== 'closed') return res.status(400).json({ error: 'Ticket must be closed to delete' });
    await prisma.ticket.delete({ where: { pkId: t.pkId } });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete ticket' });
  }
};

export const remind = async (req: Request, res: Response) => {
  try {
    const { sessionId, id } = req.params as any;
    const t = await prisma.ticket.findFirst({ where: { pkId: Number(id), sessionId } });
    if (!t) return res.status(404).json({ error: 'Ticket not found' });
    await prisma.ticketMessage.create({ data: { ticketId: t.pkId, direction: 'out', text: '[SYSTEM] Reminder sent' } });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to send reminder' });
  }
};

export const escalate = async (req: Request, res: Response) => {
  try {
    const { sessionId, id } = req.params as any;
    const t = await prisma.ticket.findFirst({ where: { pkId: Number(id), sessionId } });
    if (!t) return res.status(404).json({ error: 'Ticket not found' });
    const data = await prisma.ticket.update({ where: { pkId: t.pkId }, data: { status: 'escalated', priority: t.priority || 'urgent' } });
    await prisma.ticketMessage.create({ data: { ticketId: t.pkId, direction: 'out', text: '[SYSTEM] Manually escalated' } });
    res.status(200).json({ data });
  } catch (e) {
    res.status(500).json({ error: 'Failed to escalate ticket' });
  }
};

export const aiGet = async (req: Request, res: Response) => {
  try {
    const { sessionId, id } = req.params as any;
    const t = await prisma.ticket.findFirst({ where: { pkId: Number(id), sessionId } });
    if (!t) return res.status(404).json({ error: 'Ticket not found' });
    const lastToggle = await prisma.ticketMessage.findFirst({
      where: { ticketId: t.pkId, OR: [{ text: AI_DISABLED_TOKEN }, { text: AI_ENABLED_TOKEN }] },
      orderBy: { pkId: 'desc' },
    });
    const enabled = lastToggle ? lastToggle.text === AI_ENABLED_TOKEN : true;
    res.status(200).json({ enabled });
  } catch (e) {
    res.status(500).json({ error: 'Failed to get AI status' });
  }
};

export const aiSet = async (req: Request, res: Response) => {
  try {
    const { sessionId, id } = req.params as any;
    const { enabled } = req.body as any;
    const t = await prisma.ticket.findFirst({ where: { pkId: Number(id), sessionId } });
    if (!t) return res.status(404).json({ error: 'Ticket not found' });
    await prisma.ticketMessage.create({ data: { ticketId: t.pkId, direction: 'out', text: enabled ? AI_ENABLED_TOKEN : AI_DISABLED_TOKEN } });
    res.status(200).json({ enabled });
  } catch (e) {
    res.status(500).json({ error: 'Failed to set AI status' });
  }
};
