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
| **School admin** | Directors | Add, search, edit and remove people (roles, classes, children, WhatsApp numbers), reset passwords, create classes and manage the events calendar. |
| **Accounts & security** | Everyone | New and reset accounts get a temporary password that must be changed at first sign-in. Anyone can change their password and WhatsApp number under **My account**; changing or resetting a password signs out the account's other sessions. Repeated failed sign-ins are locked out (5 per account or 20 per IP address in 15 minutes). |

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
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | First production start | Creates the director account. Production starts with an empty school (no demo accounts) unless `SEED_DEMO=1`. |
| `SESSION_SECRET` | In production | Signs session cookies. Generate with `openssl rand -hex 32`. |
| `ANTHROPIC_API_KEY` | For AI features | Enables the assistant, AI drafting and WhatsApp auto-replies. Without it those features are hidden or fall back to a canned reply. |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | For live WhatsApp | Without them the app runs in **simulation mode**: messages are logged on the WhatsApp page but not sent. |
| `WHATSAPP_VERIFY_TOKEN` | For the webhook | Token Meta sends during webhook verification. |
| `WHATSAPP_APP_SECRET` | For the webhook in production | Verifies `X-Hub-Signature-256` on incoming webhooks. Required in production. |
| `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANGUAGE` | For reaching every parent | Approved template used for announcements to people outside the 24-hour window (language defaults to `en`). |
| `DATA_FILE` | No | Path of the JSON datastore (default `data/db.json`). |
| `SHOW_DEMO_ACCOUNTS` | No | Set to `1` to show demo-login buttons in production. |

### Connecting WhatsApp

1. Create a Meta app with the WhatsApp product and note the phone number ID and a permanent access token.
2. Set the webhook URL to `https://<your-host>/api/whatsapp/webhook`, use your `WHATSAPP_VERIFY_TOKEN`, and subscribe to the `messages` field.
3. Add each parent's and teacher's phone number in **School Admin** (international format, e.g. `+254700000001`).

#### Announcement template

Meta only delivers free-form text inside the 24-hour customer-service window, i.e. to people who messaged the school in the last 24 hours. For everyone else, announcements are sent with an approved [message template](https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates):

1. In WhatsApp Manager, create a **Utility** template named `school_announcement` (English) whose body uses exactly two variables, `{{1}}` for the title and `{{2}}` for the message, for example:
   ```
   📢 {{1}}

   {{2}}

   Reply to this message if you have any questions.
   ```
2. Once Meta approves it, set `WHATSAPP_TEMPLATE_NAME=school_announcement` (and `WHATSAPP_TEMPLATE_LANGUAGE` if not `en`).

Each broadcast then picks per recipient: free text if they're inside the window, the template otherwise. Line breaks in the message are shown as ` · ` inside the template, because Meta doesn't allow them in variables. Meta may re-categorise the template as Marketing, which changes its price but not how it works.

Subscribe the webhook to `messages` to also receive delivery receipts: the WhatsApp page then shows each message as delivered, read or failed, with Meta's error for failures.

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
    users.ts                            creating, editing and removing people; password rules
    rateLimit.ts                        failed sign-in lockout
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

## Deploying to Render

The repo includes a `render.yaml` Blueprint that creates the web service and a 1 GB persistent disk for the datastore. Serverless hosts such as Vercel are not suitable as-is, because their file system doesn't persist between requests.

1. Sign in at https://dashboard.render.com with GitHub and allow Render to access this repository.
2. Click **New → Blueprint**, pick `schoolsync-ai`, and click **Apply**.
3. When prompted, fill in `ADMIN_NAME`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` (8+ characters) for the director account. `ANTHROPIC_API_KEY` and the `WHATSAPP_*` values are optional and can be added later under **Environment**.
4. Wait for the deploy to finish, open the `onrender.com` URL, and sign in as the director.
5. In **School Admin**, add classes and teachers first, then students, then parents (with WhatsApp numbers).

The Starter instance plus disk costs roughly US$7–8/month. Every push to `main` redeploys automatically; the data on the disk is kept. To use your own domain, add it under the service's **Settings → Custom Domains**.

## Production notes

The sign-in lockout is kept in server memory, so it resets when the app restarts. That's fine for one instance; with several instances it would need shared storage.

The JSON datastore suits a single school on a single server instance. For multiple instances or larger schools, swap `src/lib/db.ts` for a real database such as Postgres; the rest of the app only uses `readDb` / `mutateDb`.
