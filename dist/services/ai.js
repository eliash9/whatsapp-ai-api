"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAIReply = void 0;
async function generateAIReply(userText, cfg) {
    var _a, _b, _c, _d, _e, _f;
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
    const baseUrl = (cfg.baseUrl || process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    const apiKey = cfg.apiKey || process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
    const authScheme = ((_b = (_a = cfg.authScheme) !== null && _a !== void 0 ? _a : process.env.AI_AUTH_SCHEME) !== null && _b !== void 0 ? _b : 'Bearer');
    const authHeaderName = (cfg.authHeaderName || process.env.AI_AUTH_HEADER || 'Authorization').trim();
    let extraHeaders = {};
    try {
        const raw = cfg.extraHeaders || process.env.AI_EXTRA_HEADERS;
        if (raw)
            extraHeaders = JSON.parse(raw);
    }
    catch (_g) { }
    const timeoutMs = Number(process.env.AI_TIMEOUT_MS || 15000);
    const body = {
        model,
        messages: [
            { role: 'system', content: basePrompt },
            { role: 'user', content: userText },
        ],
        temperature: temp,
    };
    // timeout wrapper
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let resp;
    try {
        resp = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: (() => {
                const headers = Object.assign({ 'Content-Type': 'application/json' }, extraHeaders);
                // Only include Authorization (or custom auth header) when configured
                if (authHeaderName.toLowerCase() !== 'none') {
                    // Allow sending naked key if scheme is empty
                    if (apiKey)
                        headers[authHeaderName] = authScheme ? `${authScheme} ${apiKey}` : `${apiKey}`;
                }
                else {
                    // If we disable auth header, ensure some form of credential exists via extra headers
                    if (!apiKey && Object.keys(extraHeaders).length === 0) {
                        throw new Error('AI auth disabled but no AI_EXTRA_HEADERS provided');
                    }
                }
                return headers;
            })(),
            body: JSON.stringify(body),
            signal: controller.signal,
        });
    }
    catch (e) {
        clearTimeout(timer);
        throw new Error(`AI request failed: ${(e === null || e === void 0 ? void 0 : e.message) || e}`);
    }
    clearTimeout(timer);
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`AI API error: ${resp.status} ${text}`);
    }
    const json = await resp.json();
    const text = (_f = (_e = (_d = (_c = json === null || json === void 0 ? void 0 : json.choices) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.message) === null || _e === void 0 ? void 0 : _e.content) === null || _f === void 0 ? void 0 : _f.trim();
    return text || 'Maaf, saya tidak dapat menjawab saat ini.';
}
exports.generateAIReply = generateAIReply;
