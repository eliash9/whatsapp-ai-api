import { Request, Response } from 'express';
import { prisma } from '../shared';
import { generateAIReply } from '../services/ai';

export async function getConfig(req: Request, res: Response) {
  const { sessionId } = req.params;
  const cfg = await (prisma as any).aiSetting.findUnique({ where: { sessionId } });
  res.status(200).json(cfg || { sessionId, enabled: false, prompt: null, model: null, temp: null });
}

export async function upsertConfig(req: Request, res: Response) {
  const { sessionId } = req.params;
  const { enabled, prompt, model, temp, providerBaseUrl, providerApiKey, authHeaderName, authScheme, extraHeaders } = req.body || {};
  const cfg = await (prisma as any).aiSetting.upsert({
    where: { sessionId },
    update: { enabled, prompt, model, temp, providerBaseUrl, providerApiKey, authHeaderName, authScheme, extraHeaders },
    create: { sessionId, enabled: !!enabled, prompt: prompt || null, model: model || null, temp: typeof temp === 'number' ? temp : null, providerBaseUrl: providerBaseUrl || null, providerApiKey: providerApiKey || null, authHeaderName: authHeaderName || null, authScheme: authScheme || null, extraHeaders: extraHeaders || null },
  });
  res.status(200).json(cfg);
}

export async function testReply(req: Request, res: Response) {
  const { sessionId } = req.params;
  const text = (req.body as any)?.text || (req.query as any)?.text;
  if (!text) return res.status(400).json({ error: 'text required' });
  const cfg = await (prisma as any).aiSetting.findUnique({ where: { sessionId } });
  try {
    const reply = await generateAIReply(text, { prompt: cfg?.prompt || '', model: cfg?.model || undefined, temp: cfg?.temp ?? undefined, baseUrl: cfg?.providerBaseUrl || undefined, apiKey: cfg?.providerApiKey || undefined, authHeaderName: cfg?.authHeaderName || undefined, authScheme: cfg?.authScheme || undefined, extraHeaders: cfg?.extraHeaders || undefined });
    res.status(200).json({ reply });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'AI error' });
  }
}
