export function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function parseDataUrl(dataUrl: string): { buffer: Buffer; mimetype: string } | null {
  try {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
    if (!match) return null;
    const mimetype = match[1];
    const b64 = match[2];
    const buffer = Buffer.from(b64, 'base64');
    return { buffer, mimetype };
  } catch {
    return null;
  }
}

