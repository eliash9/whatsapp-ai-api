import { Request, Response } from 'express';
import { createSession, deleteSession, getSession, getSessionStatus, listSessions, sessionExists } from '../wa';

export const list = (req: Request, res: Response) => {
  res.status(200).json(listSessions());
};

export const find = (req: Request, res: Response) => res.status(200).json({ message: 'Session found' });

export const status = (req: Request, res: Response) => {
  const session = getSession(req.params.sessionId);
  res.status(200).json({ status: getSessionStatus(session) });
};

export const add = async (req: Request, res: Response) => {
  const { sessionId, readIncomingMessages, ...socketConfig } = req.body ?? {};
  if (sessionExists(sessionId)) return res.status(400).json({ error: 'Session already exists' });
  createSession({ sessionId, res, readIncomingMessages, socketConfig });
};

export const addSSE = async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  if (sessionExists(sessionId)) {
    res.write(`data: ${JSON.stringify({ error: 'Session already exists' })}\n\n`);
    res.end();
    return;
  }

  createSession({ sessionId, res, SSE: true });
};

export const del = async (req: Request, res: Response) => {
  await deleteSession(req.params.sessionId);
  res.status(200).json({ message: 'Session deleted' });
};

