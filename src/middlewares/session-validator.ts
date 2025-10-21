import { NextFunction, Request, Response } from 'express';
import { sessionExists } from '../wa';

const validate = (req: Request, res: Response, next: NextFunction) => {
  if (!sessionExists(req.params.sessionId)) return res.status(404).json({ error: 'Session not found' });
  next();
};

export default validate;

