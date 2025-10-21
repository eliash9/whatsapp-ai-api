import { Request, Response } from 'express';
import { logger, prisma } from '../shared';
import { getSession, jidExists } from '../wa';
import { makePhotoURLHandler } from './misc';

export const list = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { cursor = undefined, limit = 25 } = req.query as { cursor?: string; limit?: number };
    const contacts = await prisma.contact.findMany({
      cursor: cursor ? { pkId: Number(cursor) } : undefined,
      take: Number(limit),
      skip: cursor ? 1 : 0,
      where: {
        sessionId,
        OR: [
          { id: { endsWith: 's.whatsapp.net' } },
          { id: { endsWith: 'c.us' } },
        ],
      },
      orderBy: { pkId: 'desc' },
    });

    res.status(200).json({
      data: contacts,
      cursor:
        contacts.length !== 0 && contacts.length === Number(limit)
          ? contacts[contacts.length - 1].pkId
          : null,
    });
  } catch (e) {
    const message = 'An error occured during contact list';
    logger.error(e, message);
    res.status(500).json({ error: message });
  }
};

export const listBlocked = async (req: Request, res: Response) => {
  try {
    const session = getSession(req.params.sessionId);
    const data = await session.fetchBlocklist();
    res.status(200).json(data);
  } catch (e) {
    const message = 'An error occured during blocklist fetch';
    logger.error(e, message);
    res.status(500).json({ error: message });
  }
};

export const updateBlock = async (req: Request, res: Response) => {
  try {
    const session = getSession(req.params.sessionId);
    const { jid, action = 'block' } = req.body as { jid: string; action?: 'block' | 'unblock' };
    const exists = await jidExists(session, jid);
    if (!exists) return res.status(400).json({ error: 'Jid does not exists' });
    await session.updateBlockStatus(jid, action);
    res.status(200).json({ message: `Contact ${action}ed` });
  } catch (e) {
    const message = 'An error occured during blocklist update';
    logger.error(e, message);
    res.status(500).json({ error: message });
  }
};

export const check = async (req: Request, res: Response) => {
  try {
    const { sessionId, jid } = req.params;
    const session = getSession(sessionId);
    const exists = await jidExists(session, jid);
    res.status(200).json({ exists });
  } catch (e) {
    const message = 'An error occured during jid check';
    logger.error(e, message);
    res.status(500).json({ error: message });
  }
};

export const photo = makePhotoURLHandler();
