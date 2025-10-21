export type AIConfig = {
  prompt?: string | null;
  model?: string | null;
  temp?: number | null;
  baseUrl?: string | null;
  apiKey?: string | null;
  authHeaderName?: string | null;
  authScheme?: string | null;
  extraHeaders?: string | null;
};

export async function generateAIReply(userText: string, cfg: AIConfig): Promise<string> {
  const basePrompt = cfg.prompt || 'You are a helpful WhatsApp assistant.';
  const model = cfg.model || 'gpt-4o-mini';
  const temp = typeof cfg.temp === 'number' ? cfg.temp : 0.7;

  // Provider-agnostic settings
  // If you want to use AgentRouter (OpenAI-compatible), set:
  //   AI_BASE_URL=https://api.agentrouter.org/v1
  //   AI_API_KEY=your_agentrouter_key
  // Or keep defaults for OpenAI:
  //   AI_BASE_URL=https://api.openai.com/v1
  //   AI_API_KEY=your_openai_key
  const baseUrl = ((cfg.baseUrl || process.env.AI_BASE_URL || 'https://api.openai.com/v1') as string).replace(/\/$/, '');
  const apiKey = cfg.apiKey || process.env.AI_API_KEY || process.env.OPENAI_API_KEY;

  const authScheme = (cfg.authScheme ?? process.env.AI_AUTH_SCHEME ?? 'Bearer') as string;
  const authHeaderName = ((cfg.authHeaderName || process.env.AI_AUTH_HEADER || 'Authorization') as string).trim();
  let extraHeaders: Record<string, string> = {};
  try {
    const raw = cfg.extraHeaders || process.env.AI_EXTRA_HEADERS;
    if (raw) extraHeaders = JSON.parse(raw);
  } catch {}

  const timeoutMs = Number(process.env.AI_TIMEOUT_MS || 15000);

  const body = {
    model,
    messages: [
      { role: 'system', content: basePrompt },
      { role: 'user', content: userText },
    ],
    temperature: temp,
  } as any;

  // timeout wrapper
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let resp: Response;
  try {
    resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: (() => {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...extraHeaders,
        };
        // Only include Authorization (or custom auth header) when configured
        if (authHeaderName.toLowerCase() !== 'none') {
          // Allow sending naked key if scheme is empty
          if (apiKey) headers[authHeaderName] = authScheme ? `${authScheme} ${apiKey}` : `${apiKey}`;
        } else {
          // If we disable auth header, ensure some form of credential exists via extra headers
          if (!apiKey && Object.keys(extraHeaders).length === 0) {
            throw new Error('AI auth disabled but no AI_EXTRA_HEADERS provided');
          }
        }
        return headers;
      })(),
      body: JSON.stringify(body),
      signal: controller.signal as any,
    } as any);
  } catch (e: any) {
    clearTimeout(timer);
    throw new Error(`AI request failed: ${e?.message || e}`);
  }
  clearTimeout(timer);

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`AI API error: ${resp.status} ${text}`);
  }

  const json: any = await resp.json();
  const text = json?.choices?.[0]?.message?.content?.trim();
  return text || 'Maaf, saya tidak dapat menjawab saat ini.';
}
