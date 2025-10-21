import { Request, Response } from 'express';

type Agent = { id: string; name: string };

function loadAgents(): Agent[] {
  try {
    const rawJson = process.env.AGENTS_JSON;
    if (rawJson) {
      const arr = JSON.parse(rawJson);
      if (Array.isArray(arr)) {
        return arr.filter((x) => x && typeof x.id === 'string' && typeof x.name === 'string');
      }
    }
  } catch {}

  const raw = process.env.AGENTS || '';
  if (raw) {
    // formats supported: "id:name,id2:name2" OR "name1,name2"
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
    const out: Agent[] = [];
    for (const p of parts) {
      const [id, name] = p.includes(':') ? p.split(':', 2) : [p, p];
      out.push({ id: id.trim(), name: (name || id).trim() });
    }
    return out;
  }
  return [];
}

export const list = async (_req: Request, res: Response) => {
  const data = loadAgents();
  res.status(200).json({ data });
};

