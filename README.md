# schoolsync-ai

An AI-powered school communication management system with WhatsApp integration, AI assistant, announcement management, poster designer, and role-based dashboards for directors, teachers, parents, and students.

Built with Next.js 15 (App Router), React 19 and TypeScript. The AI features use the Claude API (`@anthropic-ai/sdk`); WhatsApp uses the Meta WhatsApp Cloud API.

## Features

| Feature | Who | What it does |
|---|---|---|
| **Role-based dashboards** | Everyone | Directors see school-wide stats, classes and setup status; teachers see their classes, students and parents; parents see their children's classes and urgent notices; students see their class news. |
| **Announcements** | Directors & teachers publish; everyone reads | Target by audience (teachers / parents / students) and by class or school-wide, mark as urgent, attach a poster. Visibility is enforced server-side: a parent only sees notices for their own children's classes. Teachers can only post to classes they teach. |
| **AI drafting** | Directors & teachers | Paste rough notes, get a polished title and message back (structured output; told to keep every fact and invent none). |
| **AI assistant** | Everyone | Streaming chat that answers questions from the announcements and events *that user is allowed to see*. |
| **WhatsApp** | Directors & teachers | Broadcast an announcement to every audience member with a phone number. Inbound WhatsApp messages from registered numbers get an AI reply grounded in that person's school info. Full message log and an inbound-message simulator for testing. |
| **Poster designer** | Directors & teachers | Canvas editor with four templates, custom colours and text; save, download as PNG, and attach to announcements (rendered inline for readers). |
| **School admin** | Directors | Add people (with roles, classes, children, WhatsApp numbers) and manage the events calendar. |

## Quick start

```bash
npm install
cp .env.example .env.local   # optional: add API keys
npm run dev
```

Open http://localhost:3000. On first run a demo school is seeded into `data/db.json`. In development the login page shows one-click demo accounts (password `schoolsync`):

| Role | Email |
|---|---|
| Director | director@schoolsync.test |
| Teacher (Grade 7 East) | teacher@schoolsync.test |
| Teacher (Grade 8 West) | teacher2@schoolsync.test |
| Parent (of a Grade 7 student) | parent@schoolsync.test |
| Parent (of a Grade 8 student) | parent2@schoolsync.test |
| Student (Grade 7 East) | student@schoolsync.test |

Delete `data/db.json` to reset to the demo data.

## Configuration

All settings are environment variables (see `.env.example`):

| Variable | Required | Purpose |
|---|---|---|
| `SESSION_SECRET` | In production | Signs session cookies. Generate with `openssl rand -hex 32`. |
| `ANTHROPIC_API_KEY` | For AI features | Enables the assistant, AI drafting and WhatsApp auto-replies. Without it those features are hidden or fall back to a canned reply. |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | For live WhatsApp | Without them the app runs in **simulation mode**: messages are logged on the WhatsApp page but not sent. |
| `WHATSAPP_VERIFY_TOKEN` | For the webhook | Token Meta sends during webhook verification. |
| `WHATSAPP_APP_SECRET` | For the webhook in production | Verifies `X-Hub-Signature-256` on incoming webhooks. Required in production. |
| `DATA_FILE` | No | Path of the JSON datastore (default `data/db.json`). |
| `SHOW_DEMO_ACCOUNTS` | No | Set to `1` to show demo-login buttons in production. |

### Connecting WhatsApp

1. Create a Meta app with the WhatsApp product and note the phone number ID and a permanent access token.
2. Set the webhook URL to `https://<your-host>/api/whatsapp/webhook`, use your `WHATSAPP_VERIFY_TOKEN`, and subscribe to the `messages` field.
3. Add each parent's and teacher's phone number in **School Admin** (international format, e.g. `+254700000001`).

Meta only delivers free-form text inside the 24-hour customer-service window (i.e. after the recipient has messaged you). For cold broadcasts to parents you need an approved [message template](https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates); `src/lib/whatsapp.ts` is where to add one.

## AI details

`src/lib/ai.ts` holds all Claude calls:

- Model `claude-opus-5-5`, with server-side refusal fallbacks enabled (`fallbacks: "default"`): a request a safety classifier declines is retried on Anthropic's recommended fallback model instead of failing.
- The assistant streams responses at low effort for snappy chat; announcement drafting uses structured JSON output.
- The system prompt is split so the stable instructions are prompt-cached, followed by the per-user school context (only data that user can see).

## Project layout

```
src/
  app/
    (app)/            signed-in pages: dashboard, announcements, assistant, posters, whatsapp, school
    api/              route handlers (auth, announcements, assistant, posters, events, users, whatsapp)
    login/            sign-in page
  components/         shared UI
  lib/
    ai.ts                               Claude integration
    auth.ts, session.ts, password.ts    cookie sessions + scrypt passwords
    db.ts                               JSON-file datastore with serialized, atomic writes
    permissions.ts                      who can see / post / manage what
    whatsapp.ts, inbound.ts, broadcast.ts   Cloud API client, webhook handling, broadcasts
    poster.ts                           poster templates and canvas renderer
tests/                node:test unit tests
```

## Scripts

```bash
npm run dev     # development server
npm run build   # production build
npm start       # run the production build
npm run lint    # type-check
npm test        # unit tests
```

## Production notes

The JSON datastore suits a single school on a single server instance. For multiple instances or larger schools, swap `src/lib/db.ts` for a real database such as Postgres; the rest of the app only uses `readDb` / `mutateDb`.
