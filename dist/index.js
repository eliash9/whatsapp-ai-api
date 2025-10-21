"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const routes_1 = __importDefault(require("./routes"));
const wa_1 = require("./wa");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
// increase body limit to support base64 media (images/videos)
app.use(express_1.default.json({ limit: '25mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '25mb' }));
// serve dashboard UI
app.use(express_1.default.static('dashboard'));
//app.use('/dashboard', express.static('dashboard'));
app.use('/', routes_1.default);
app.all('*', (req, res) => res.status(404).json({ error: 'URL not found.' }));
const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 3000);
const listener = () => console.log(`Server is listening on http://${host}:${port}`);
(async () => {
    var _a;
    await (0, wa_1.init)();
    app.listen(port, host, listener);
    // SLA worker guarded by env
    const slaEnabled = (((_a = process.env.SLA_ENABLED) !== null && _a !== void 0 ? _a : 'false') + '').toLowerCase() === 'true';
    if (slaEnabled) {
        const { prisma } = await Promise.resolve().then(() => __importStar(require('./shared')));
        setInterval(async () => {
            try {
                const now = new Date();
                const overdue = await prisma.ticket.findMany({ where: { slaDueAt: { lt: now }, status: { not: 'closed' } }, take: 50 });
                for (const t of overdue) {
                    const newStatus = t.status === 'escalated' ? t.status : 'escalated';
                    await prisma.ticket.update({ where: { pkId: t.pkId }, data: { status: newStatus, priority: t.priority || 'urgent' } });
                    await prisma.ticketMessage.create({ data: { ticketId: t.pkId, direction: 'out', text: '[SYSTEM] SLA overdue — auto-escalated' } });
                }
            }
            catch (_a) { }
        }, 60000);
    }
})();
