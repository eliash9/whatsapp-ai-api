"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testReply = exports.upsertConfig = exports.getConfig = void 0;
const shared_1 = require("../shared");
const ai_1 = require("../services/ai");
async function getConfig(req, res) {
    const { sessionId } = req.params;
    const cfg = await shared_1.prisma.aiSetting.findUnique({ where: { sessionId } });
    res.status(200).json(cfg || { sessionId, enabled: false, prompt: null, model: null, temp: null });
}
exports.getConfig = getConfig;
async function upsertConfig(req, res) {
    const { sessionId } = req.params;
    const { enabled, prompt, model, temp, providerBaseUrl, providerApiKey, authHeaderName, authScheme, extraHeaders } = req.body || {};
    const cfg = await shared_1.prisma.aiSetting.upsert({
        where: { sessionId },
        update: { enabled, prompt, model, temp, providerBaseUrl, providerApiKey, authHeaderName, authScheme, extraHeaders },
        create: { sessionId, enabled: !!enabled, prompt: prompt || null, model: model || null, temp: typeof temp === 'number' ? temp : null, providerBaseUrl: providerBaseUrl || null, providerApiKey: providerApiKey || null, authHeaderName: authHeaderName || null, authScheme: authScheme || null, extraHeaders: extraHeaders || null },
    });
    res.status(200).json(cfg);
}
exports.upsertConfig = upsertConfig;
async function testReply(req, res) {
    var _a, _b, _c;
    const { sessionId } = req.params;
    const text = ((_a = req.body) === null || _a === void 0 ? void 0 : _a.text) || ((_b = req.query) === null || _b === void 0 ? void 0 : _b.text);
    if (!text)
        return res.status(400).json({ error: 'text required' });
    const cfg = await shared_1.prisma.aiSetting.findUnique({ where: { sessionId } });
    try {
        const reply = await (0, ai_1.generateAIReply)(text, { prompt: (cfg === null || cfg === void 0 ? void 0 : cfg.prompt) || '', model: (cfg === null || cfg === void 0 ? void 0 : cfg.model) || undefined, temp: (_c = cfg === null || cfg === void 0 ? void 0 : cfg.temp) !== null && _c !== void 0 ? _c : undefined, baseUrl: (cfg === null || cfg === void 0 ? void 0 : cfg.providerBaseUrl) || undefined, apiKey: (cfg === null || cfg === void 0 ? void 0 : cfg.providerApiKey) || undefined, authHeaderName: (cfg === null || cfg === void 0 ? void 0 : cfg.authHeaderName) || undefined, authScheme: (cfg === null || cfg === void 0 ? void 0 : cfg.authScheme) || undefined, extraHeaders: (cfg === null || cfg === void 0 ? void 0 : cfg.extraHeaders) || undefined });
        res.status(200).json({ reply });
    }
    catch (e) {
        res.status(500).json({ error: (e === null || e === void 0 ? void 0 : e.message) || 'AI error' });
    }
}
exports.testReply = testReply;
