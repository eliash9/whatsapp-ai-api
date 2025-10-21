import { Request, Response } from 'express';
import { prisma } from '../shared';

// Use raw SQL to avoid relying on generated Prisma client models
export const list = async (req: Request, res: Response) => {
  const q = ((req.query.q as string) || '').trim();
  try {
    const data = q
      ? (await prisma.$queryRawUnsafe(
          'SELECT `pkId`, `title`, `text`, `tags`, `createdAt`, `updatedAt` FROM `QuickReply` WHERE `title` LIKE ? OR `text` LIKE ? OR `tags` LIKE ? ORDER BY `updatedAt` DESC',
          `%${q}%`, `%${q}%`, `%${q}%`
        ))
      : (await prisma.$queryRawUnsafe(
          'SELECT `pkId`, `title`, `text`, `tags`, `createdAt`, `updatedAt` FROM `QuickReply` ORDER BY `updatedAt` DESC'
        ));
    res.status(200).json({ data });
  } catch (e) {
    res.status(500).json({ error: 'failed to load' });
  }
};

export const create = async (req: Request, res: Response) => {
  const { title, text, tags } = req.body || {};
  if (!title || !text) return res.status(400).json({ error: 'title and text are required' });
  try {
    await prisma.$executeRawUnsafe(
      'INSERT INTO `QuickReply` (`title`, `text`, `tags`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, NOW(), NOW())',
      String(title), String(text), tags ? String(tags) : null
    );
    const rows: any = await prisma.$queryRawUnsafe('SELECT `pkId`, `title`, `text`, `tags`, `createdAt`, `updatedAt` FROM `QuickReply` ORDER BY `pkId` DESC LIMIT 1');
    res.status(201).json({ data: rows && rows[0] ? rows[0] : null });
  } catch (e) {
    res.status(500).json({ error: 'failed to create' });
  }
};

export const update = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid id' });
  const { title, text, tags } = req.body || {};
  const sets: string[] = [];
  const vals: any[] = [];
  if (title !== undefined) { sets.push('title = ?'); vals.push(String(title)); }
  if (text !== undefined) { sets.push('text = ?'); vals.push(String(text)); }
  if (tags !== undefined) { sets.push('tags = ?'); vals.push(tags ? String(tags) : null); }
  if (!sets.length) return res.status(400).json({ error: 'no changes' });
  try {
    await prisma.$executeRawUnsafe(`UPDATE \`QuickReply\` SET ${sets.map(s=>`\`${s.split('=')[0].trim()}\` = ?`).join(', ')}, \`updatedAt\` = NOW() WHERE \`pkId\` = ?`, ...vals, id);
    const rows: any = await prisma.$queryRawUnsafe('SELECT `pkId`, `title`, `text`, `tags`, `createdAt`, `updatedAt` FROM `QuickReply` WHERE `pkId` = ?', id);
    if (!rows || !rows[0]) return res.status(404).json({ error: 'not found' });
    res.status(200).json({ data: rows[0] });
  } catch (e) {
    res.status(500).json({ error: 'failed to update' });
  }
};

export const remove = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid id' });
  try {
    const r: any = await prisma.$executeRawUnsafe('DELETE FROM `QuickReply` WHERE `pkId` = ?', id);
    const affected = typeof r === 'number' ? r : (r && (r as any).count) || 0;
    if (!affected) return res.status(404).json({ error: 'not found' });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'failed to delete' });
  }
};
