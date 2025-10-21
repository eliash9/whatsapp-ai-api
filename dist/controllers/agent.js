"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.list = void 0;
function loadAgents() {
    try {
        const rawJson = process.env.AGENTS_JSON;
        if (rawJson) {
            const arr = JSON.parse(rawJson);
            if (Array.isArray(arr)) {
                return arr.filter((x) => x && typeof x.id === 'string' && typeof x.name === 'string');
            }
        }
    }
    catch (_a) { }
    const raw = process.env.AGENTS || '';
    if (raw) {
        // formats supported: "id:name,id2:name2" OR "name1,name2"
        const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
        const out = [];
        for (const p of parts) {
            const [id, name] = p.includes(':') ? p.split(':', 2) : [p, p];
            out.push({ id: id.trim(), name: (name || id).trim() });
        }
        return out;
    }
    return [];
}
const list = async (_req, res) => {
    const data = loadAgents();
    res.status(200).json({ data });
};
exports.list = list;
