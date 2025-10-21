import cors from 'cors';
import 'dotenv/config';
import express from 'express';

import routes from './routes';
import { init } from './wa';

const app = express();

app.use(cors());
// increase body limit to support base64 media (images/videos)
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
// serve dashboard UI
app.use(express.static('dashboard'));
//app.use('/dashboard', express.static('dashboard'));

app.use('/', routes);
app.all('*', (req, res) => res.status(404).json({ error: 'URL not found.' }));

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 3000);
const listener = () => console.log(`Server is listening on http://${host}:${port}`);

(async () => {
  await init();
  app.listen(port, host, listener);
  // SLA worker guarded by env
  const slaEnabled = ((process.env.SLA_ENABLED ?? 'false') + '').toLowerCase() === 'true';
  if (slaEnabled) {
    const { prisma } = await import('./shared');
    setInterval(async () => {
      try {
        const now = new Date();
        const overdue = await prisma.ticket.findMany({ where: { slaDueAt: { lt: now }, status: { not: 'closed' } }, take: 50 });
        for (const t of overdue) {
          const newStatus = t.status === 'escalated' ? t.status : 'escalated';
          await prisma.ticket.update({ where: { pkId: t.pkId }, data: { status: newStatus, priority: t.priority || 'urgent' } });
          await prisma.ticketMessage.create({ data: { ticketId: t.pkId, direction: 'out', text: '[SYSTEM] SLA overdue — auto-escalated' } });
        }
      } catch {}
    }, 60_000);
  }
})();
