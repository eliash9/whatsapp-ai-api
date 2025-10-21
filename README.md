# WhatsApp AI API (Baileys)

A simple, production‑minded WhatsApp REST API built on Baileys with:
- Multi‑session device support
- Ticketing inbox (open/in_progress/assigned/escalated/closed)
- AI auto‑reply per session/per ticket
- Quick Replies (Jawab Cepat) with DB CRUD and slash menu in ticket chat
- Static dashboard (no build step) for sessions, tickets, quick replies, and more

This repo uses Prisma + MySQL for storage and exposes an Express API plus a lightweight dashboard served from `dashboard/`.

## Features
- Sessions: create, list, delete; QR via REST or SSE
- Messages/Chats/Contacts/Groups: basic list/fetch via REST
- Ticketing:
  - Auto‑creates tickets on inbound 1:1 messages (not groups)
  - Tracks `Ticket` and `TicketMessage` history
  - Read marker + unread count in list
  - Reply with text or media (image/video/document)
  - Close, escalate, SLA hooks (optional)
  - Clear chat and delete ticket (only if `closed`)
- AI Auto‑Reply:
  - Per‑session enable via DB (`AiSetting`) or env fallback
  - Master prompt + knowledge base from Quick Replies (relevant items)
  - Per‑ticket toggle on/off (stores markers in `TicketMessage`)
- Quick Replies (Jawab Cepat):
  - DB model `QuickReply`
  - API under `/api/quick-replies`
  - Dashboard page `dashboard/quick-replies/` for CRUD
  - Slash menu in ticket input: type `/` then filter, or `/judul` for exact match

## Requirements
- Node.js 16+ (recommended 18+)
- MySQL 8.x (or compatible) and `DATABASE_URL` in `.env`

## Environment
Create `.env` with at least:

```
# Web server
HOST=0.0.0.0
PORT=3000

# Database (MySQL)
DATABASE_URL=mysql://user:pass@host:3306/dbname

# Ticketing
TICKETING_ENABLED=true
SLA_ENABLED=false

# AI (OpenAI-compatible)
AI_ENABLED=false
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-xxxxx
AI_MODEL=gpt-4o-mini
AI_PROMPT=You are a helpful WhatsApp assistant.
AI_TEMP=0.7
# Optional custom auth header/scheme
AI_AUTH_HEADER=Authorization
AI_AUTH_SCHEME=Bearer
# Optional JSON headers: {"X-Api-Key":"..."}
AI_EXTRA_HEADERS=

# Agents list (optional)
# AGENTS=name1,name2  OR  AGENTS_JSON=[{"id":"a","name":"Alice"}]
AGENTS=
AGENTS_JSON=
```

## Install & Run

1) Install deps
```
npm install
```

2) Migrate DB
```
# If you already have migrations checked in
npx prisma migrate deploy
# Or during development
npx prisma migrate dev
```

3) Build and start
```
npm run build
npm start
# Server at http://HOST:PORT (default http://0.0.0.0:3000)
```

4) Create a session
- REST: `POST /sessions/add` with JSON `{ "sessionId": "dev", "readIncomingMessages": true }`
- Or SSE QR: `GET /sessions/:sessionId/add-sse`
- List sessions: `GET /sessions`

5) Dashboard
- Static dashboard is served from `/`.
- Tickets: `/tickets/`
- Quick Replies: `/quick-replies/`

## API Overview (selected)

Sessions
- `GET /sessions` — list session IDs
- `POST /sessions/add` — create session (QR)
- `GET /sessions/:sessionId/status` — status
- `DELETE /sessions/:sessionId` — delete session

Tickets
- `GET /:sessionId/tickets?status=&q=&limit=&cursor=` — list (DB read; no active session required)
- `GET /:sessionId/tickets/:id` — detail + messages
- `PUT /:sessionId/tickets/:id` — update meta (status, subject, priority, assignedTo, slaDueAt)
- `POST /:sessionId/tickets/:id/reply` — send reply (text or media {image|video|document})
- `POST /:sessionId/tickets/:id/close` — set status to closed
- `POST /:sessionId/tickets/:id/read` — update lastReadPkId
- `GET /:sessionId/tickets/:id/media/:messagePkId` — download media
- `GET /:sessionId/tickets/:id/media/:messagePkId/meta` — media type
- `GET /:sessionId/tickets/:id/ai` — get per‑ticket AI state
- `POST /:sessionId/tickets/:id/ai` — set `{enabled: boolean}`
- `DELETE /:sessionId/tickets/:id/messages` — clear all messages (only if closed)
- `DELETE /:sessionId/tickets/:id` — delete ticket (only if closed)

Quick Replies (Jawab Cepat)
- `GET /api/quick-replies?q=` — list
- `POST /api/quick-replies` — create `{title,text,tags?}`
- `PUT /api/quick-replies/:id` — update
- `DELETE /api/quick-replies/:id` — delete

## Dashboard Highlights
- Tickets list with unread count and preview
- Ticket chat with media preview, attachments, and slash quick replies
- Ticket meta controls (status/agent/SLA) and per‑ticket AI toggle
- Quick Replies manager page for CRUD

## Notes & Behaviors
- Body size for media is raised to `25mb` and attachments are sent via DataURL (base64) from the dashboard.
- Ticketing ignores group chats; only 1:1 messages create/append tickets.
- JID normalization: inbound JIDs are normalized to user JID (non‑LID). When replying, the system normalizes `customerJid` and also fixes existing tickets that were stored with LID.
- AI auto‑reply: If per‑session `AiSetting.enabled` is true, uses its config. Otherwise, falls back to env (`AI_ENABLED=true` etc.).
- AI knowledge base: relevant Quick Replies are injected into the system prompt to guide answers; irrelevant entries are to be ignored by the model.

## Troubleshooting
- Tickets list kosong:
  - Pastikan ada sesi yang dipilih di sidebar. UI otomatis memilih sesi pertama setelah refresh.
  - Cek DB `Ticket` (sessionId harus sesuai dengan yang dipilih).
- Quick Replies tidak muncul:
  - API path benar: `/api/quick-replies` (bukan `/quick-replies`, itu halaman dashboard).
  - Pastikan migrasi tabel `QuickReply` sudah terpasang.
- Balasan tidak terkirim:
  - Periksa apakah tiket menyimpan `customerJid` dengan domain LID; sistem sekarang menormalkan JID saat kirim maupun saat inbound.
- Prisma client generate error:
  - Proyek memakai query mentah untuk fitur tertentu agar tidak tergantung regenerate; tetap disarankan `npx prisma generate` bila Anda memodifikasi schema.

## Development
- TypeScript sources in `src/`, compiled output in `dist/`.
- Prisma schema in `prisma/schema.prisma` with migrations in `prisma/migrations/`.
- Keep changes focused and run `npm run build` to compile.

## License
MIT

