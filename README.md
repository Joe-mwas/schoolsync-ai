# schoolsync-ai

An AI-powered school communication management system with WhatsApp integration, AI assistant, announcement management, poster designer, and role-based dashboards for directors, teachers, parents, and students.

Built with Next.js 15 (App Router), React 19 and TypeScript. The AI features use the Claude API (`@anthropic-ai/sdk`); WhatsApp uses the Meta WhatsApp Cloud API.

## Features

| Feature | Who | What it does |
|---|---|---|
| **Role-based dashboards** | Everyone | Directors see school-wide stats, classes and setup status; teachers see their classes, students and parents; parents see their children's classes and urgent notices; students see their class news. |
| **Announcements** | Directors, secretary & teachers publish; everyone reads | Target by audience (teachers / parents / students) and by class or school-wide, mark as urgent, attach a poster. Visibility is enforced server-side: a parent only sees notices for their own children's classes. Teachers can only post to classes they teach. |
| **AI drafting** | Directors, secretary & teachers | Paste rough notes, get a polished title and message back (structured output; told to keep every fact and invent none). |
| **AI assistant** | Everyone | Streaming chat that answers questions from the announcements and events *that user is allowed to see*. |
| **WhatsApp** | Administrator, headteacher, secretary (inbox); staff broadcast announcements | Broadcast an announcement to every audience member with a phone number. Inbound WhatsApp messages from registered numbers get an AI reply grounded in that person's school info. Full message log and an inbound-message simulator for testing. |
| **Poster designer** | Administrator, headteacher, secretary & teachers | Canvas editor with four templates, custom colours and text; save, download as PNG, and attach to announcements (rendered inline for readers). |
| **Spreadsheet import** | Administrator, headteacher | Upload a CSV class list (one row per student, with class and optional admission number and parent name/phone/email). Preview shows exactly what will happen per row; missing classes are created, siblings share one parent account, re-importing adds nothing twice, and bad rows are skipped with a reason. Temporary passwords for new accounts are downloaded as a CSV to hand out. |
| **Encryption & off-site backups** | Administrator | With `DATA_ENCRYPTION_KEY` set (Setup → **Generate a key**), the data file and every backup are encrypted with AES-256-GCM, which also detects tampering; existing data and backups are encrypted on the next start, and downloaded backups stay encrypted (only an app with the key can restore them). With the `OFFSITE_BACKUP_*` settings, an encrypted copy is uploaded every day to storage outside Render (Cloudflare R2, Backblaze B2 or Amazon S3), and **Back up off-site now** on Setup uploads one at once. Copies are never uploaded unencrypted. To change the key, put the old one in `DATA_ENCRYPTION_KEY_PREVIOUS`. Fact pictures and the logo (`images/`) aren't encrypted; onboarding documents (`documents/`) are. Neither folder is inside the backups, so copy them with the data if you move servers. |
| **Backups** | Administrator | A compressed backup is saved automatically each day there are changes, and before every spreadsheet import and every restore (14 daily and 20 other backups kept). The administrator can back up now, download any backup or the current data, and restore from a listed backup or an uploaded file. A restore that would lock out the administrator doing it is refused. |
| **WhatsApp hub** | Everyone | Parents message the school and get a menu: **1** results, **2** fee balance, **3** events, **4** ask a question (Swahili keywords such as *matokeo*, *karo*, *ada* also work). Menu answers come straight from the records, so they're instant and work without the AI; typed questions go to the AI, which sees only that parent's own children's records. Teachers get their classes' latest results; learners their own. The WhatsApp page shows every conversation as a chat thread, with a box to test as any contact. |
| **Director's brief** | Administrator, directors, secretary | Send "brief" (since the last one), "brief today", "brief this week" or "brief this month" on WhatsApp, or use **Brief me** on the dashboard: fees collected and outstanding by class, latest CBC results by class with learners needing support, what parents asked about (grouped into themes by the AI) and anything unanswered, upcoming events, flagged AI answers, and suggested actions. Without the AI, the same figures are sent as a plain report. |
| **Results (CBC)** | Teachers, directors | EE / ME / AE / BE (and EE1–BE2) per learning area plus a teacher's comment, entered in a class grid or uploaded from a spreadsheet (one column per learning area). Teachers can only record results for their own classes. |
| **Fees** | Administrator, directors, secretary | Every learner's balance, a statement per learner, recording payments (M-Pesa references can't be entered twice) and charges, setting a term fee for a whole class, and uploading totals from a fees spreadsheet. Parents see their balance on WhatsApp and on their dashboard. |
| **Fee reminders** | Administrator, directors, secretary | On the Fees page: choose the whole school or a class and a minimum balance, preview, then send. Each parent gets one WhatsApp message listing every child who owes, the Paybill and each child's account number, plus an optional line (e.g. a deadline). Parents reminded in the last 7 days (adjustable) are skipped; learners whose parents have no WhatsApp number are listed to call instead. Sent in the background and logged on the WhatsApp page. |
| **M-Pesa auto-recording** | Administrator, directors, secretary | Parents pay the school Paybill with the learner's **admission number** as the account number. Safaricom notifies the app; the payment is added to the learner's fees (oldest unpaid term first) and the parent gets a WhatsApp receipt with the new balance. Learners are also found by name ("Brian Kamau", "BrianKamau-G7E"); anything unclear waits on the Fees page under **Needs a learner** to be recorded or dismissed. Safaricom retries and receipts already typed in by hand are never counted twice. Parents who owe see the Paybill and account number in their WhatsApp balance. **Test a payment** runs the whole flow without real money. |
| **Roles** | Everyone | Chain of command: **Administrator** (the system owner, created from `ADMIN_EMAIL`): everything, plus Setup, AI Review, Admin AI and managing administrator accounts. **Director**: a short menu to oversee the school: dashboard, announcements, AI Assistant (the School AI), results, fees, school facts, events, duties (view-only, every duty) and the morning brief. The director doesn't add people or change settings. **Headteacher** (second in command, education): every class's results, classes and teacher assignments, adding and removing teachers, learners and parents (class-list import), duties, school-wide announcements, events, the WhatsApp inbox, fees view-only, the School AI and the morning brief. **Secretary**: the office: fees and M-Pesa, announcements, WhatsApp, posters, events, school facts and the brief; results view-only. **Teacher**, **parent**, **student** as below. Each role's menu and dashboard show only its own work: e.g. a learner sees Dashboard, Announcements, AI Assistant, Assignments & revision and My account. |
| **School facts** | Administrator, directors, secretary | Fees and how to pay, uniform, term dates, school hours, contacts, transport, meals and policies, entered once as short facts. Every AI answer (assistant, WhatsApp, Draft with AI) is given these facts and must answer from them instead of guessing. Facts can be staff-only (never shown to parents or learners). In AI Review, **Save as school fact** turns a correction into a fact, so the same mistake isn't made again. A fact can have a **picture** (e.g. the uniform): when someone asks on WhatsApp for a picture or photo of it ("picha ya sare" works too), the picture is sent with the fact as its caption, even without the AI. Pictures are stored in `images/` next to the database (back that folder up with it). |
| **Admin AI** | Administrator only | A private helper on its own page. Describe a problem in plain words ("a parent can't sign in", "Ann didn't get the reminder", "is WhatsApp working?") and it investigates with read-only checks (settings and connections, people, WhatsApp delivery and errors, fees, M-Pesa, sign-in lockouts, a data health check), explains what's wrong, and proposes fixes: correct a person's details, reset a password, clear a lockout, match an M-Pesa payment, resend a message. **Nothing changes until you click Approve**; each fix is re-checked and run with your permissions, and every proposal is kept as a history. Temporary passwords are shown only to you. It can also write up new features you want as requests to copy to the developer; it can't change settings, keys or code. |
| **School AI** | Director (as **AI Assistant**), headteacher | The director's own AI page, limited to the school and its families: fees and payments (by class or learner, M-Pesa), events and activities, finding a family and its balance, and what parents are asking on WhatsApp. It only reads, never changes anything. Questions about the SchoolSync system itself (sign-in, settings, errors, features) are forwarded to the administrator: saved on their Admin AI page and sent to their WhatsApp. |
| **Morning brief** | Director, headteacher | Each weekday at 07:00 Nairobi time the director's brief is sent to their WhatsApp automatically (`MORNING_BRIEF_TIME`, e.g. `06:30` or `off`; `MORNING_BRIEF_DAYS=daily` to include weekends). Outside WhatsApp's 24-hour window the approved template invites them to reply BRIEF. |
| **Assignments & revision** | Teachers (own classes), headteacher, administrator set; learners | Teachers set assignments (subject, instructions, due date, optional link) and revision work (topics and practice) for their classes. Learners see only their own class's work under **Assignments & revision**, with what's due soon on their dashboard, and tick each assignment off; teachers see how many have finished. The learner's AI Assistant knows what's due and what to revise, explains topics and quizzes them, and guides them through assignments rather than doing them. |
| **Duties** | Headteacher and administrator assign; director views; teachers | Give one or more teachers a duty (duty teacher, games, exams, clubs, trips) with optional dates and details. Each teacher gets it on WhatsApp, sees it on their dashboard and the Duties page, and marks it done; the headteacher and director see every duty and who finished it. |
| **AI Review** | Administrator | Every question asked to the AI (assistant chat, WhatsApp replies, Draft with AI) with the answer it gave; mark answers as right or flag them as wrong with a note; filter by unreviewed, flagged, source or text. The last 5,000 conversations are kept, and the assistant page tells users conversations may be reviewed. |
| **Setup page** | Administrator | A checklist of every setting (basics, Claude, WhatsApp) showing what's ready or missing and where to find each value, the webhook address to copy into Meta, and buttons to test the Claude key, the WhatsApp token/number, the webhook, and a real test message. |
| **School admin** | Administrator, headteacher (teachers, learners, parents) | Add, search, edit and remove people (roles, classes, children, WhatsApp numbers), reset passwords, and create classes. The events calendar has its own **Events** page (directors and secretary). |
| **AI insights** | Director, headteacher, secretary, administrator | Under the dashboard charts, the AI reads the same figures and writes what's **going well**, what **needs attention** and **what to do next** (1–3 short points each, quoting the figures). Each role only hears about what its charts show (the headteacher results, the secretary money). Only figures are sent, never learners' or parents' names. Insights are saved and reused until the figures change or a day passes, so visiting the dashboard doesn't call the AI each time; **Refresh** asks again. |
| **Chat buddy** | Administrator | A chat bubble in the bottom-right corner of every page (except the Admin AI page itself) opens a small chat with the Admin AI, tuned for quick, short answers. Suggested questions to start, the conversation kept while moving between pages, and proposed changes shown with **Approve / Reject** right in the chat. Full screen on phones; Esc closes it. |
| **AI for parents and learners** | Administrator | Setup → Connections & security → **AI for parents and learners** chooses which Claude model answers parents' and learners' questions: **Economy** (Claude Haiku 5.5, the default, about KSh 0.1 an answer), **Balanced** (Claude Sonnet 5.5, about KSh 2) or **Top** (Claude Opus 5.5, about KSh 4). Staff questions, the chat buddy, briefs and insights always use the top model. |
| **Two-step sign-in** | Staff | In **My account → Two-step sign-in**, staff connect a free authenticator app (Google or Microsoft Authenticator) by scanning a QR code; signing in then asks for the password **and** the app's 6-digit code, so a stolen password alone can't open the account. Ten one-time backup codes cover a lost phone. The administrator can **require it for all staff** (Setup → Connections & security → Sign-in security); staff without it are then asked to set it up before anything else. Resetting someone's password in School Admin also turns off their two-step sign-in so they can set it up on a new phone. Parents and learners sign in as before. |
| **Emergency administrator reset** | Whoever runs the hosting | If the administrator is locked out, add `ADMIN_RESET_PASSWORD` (8+ characters, and `ADMIN_EMAIL` set to the administrator's email) in Render → Environment and save. On the next start that administrator's password becomes this value: they sign in with it, must choose a new password at once, and two-step sign-in is turned off so it can be set up again. Each value is applied once and recorded in the activity log; **remove the setting afterwards**. |
| **Add people from sign-in requests** | Administrator | When someone without an account uses **Forgot your password?**, their request on the dashboard has **Add & give password**: confirm the role (pre-filled from their choice), optionally pick their class or child, and the account is created from their name and email/phone with a temporary password, shown once with **Copy message to send**. They sign in and choose their own password. Administrators can't be added this way; staff need an email address. |
| **Noticeboard and posters** | Everyone | **📌 Noticeboard** in the menu (right under Dashboard) shows every poster and announcement each person is meant to see, newest first, posters large, with filters for posters and announcements; notifications open the exact item. The dashboard also shows the **School noticeboard**: the latest announcements each person is meant to see, **with their posters**, new ones marked. In the Poster Designer, **Share on the noticeboard** posts a poster to everyone, families only or staff (teachers: their class), with a message. |
| **Notifications (bell and phone)** | Everyone | A **bell** in the menu counts what's new and lists it: announcements and posters; new results, assignments and fee payments for families; WhatsApp messages for the office; sign-in help for the administrator. It checks every minute and the tab title shows the count. **Turn on phone notifications** (in the bell or My account) to get them on the phone or computer even with SchoolSync closed: announcements and posters, new results for parents, new assignments for learners, WhatsApp messages the system couldn't answer for the office, and sign-in help for the administrator. It's free (standard web push). On iPhone, add SchoolSync to the Home Screen first (Share → Add to Home Screen). Lock-screen text never shows marks or message contents. |
| **Floating menu** | Everyone | The menu is a rounded card floating off the screen edges, with a soft glowing border and shadow, an icon beside each item, and group headings (Everyday, School, Admin). **Shrink menu** turns it into icons only (remembered on the device). On phones a floating bar at the bottom holds the four main places (e.g. Dashboard, Notices, Results, Ask AI) and **More**, which slides up the full menu, account, sign out and theme. |
| **SchoolSync logo** | Everyone | On the sign-in page the cap pops in, the sync arrows draw round it and turn every few seconds, and "School" and "Sync" glide in from either side and meet, then "Sync" shines now and then. In the menu the arrows turn once when you point at the logo. |
| **Sign-in scene** | Everyone | The sign-in page's picture builds in layer by layer, then: messages (glowing dots) travel between the school and families' homes along dotted lines, both ways; learners walk up to the school door with an eased walk cycle and soft shadows, the school bus eases in, stops at the school and pulls away (its wheels turn with the distance travelled), birds fly past, the sun glows, trees sway and the flag waves. Layers shift slightly with the mouse for depth. In Dark mode it's night: moon, twinkling stars and lit windows. Only transforms and opacity animate, and it stands still for people who prefer reduced motion. |
| **Auto sign-out** | Staff | Staff are signed out after 15, 30 (default), 60 or 120 minutes without activity, chosen in Setup → Sign-in security, with a one-minute "Still there?" warning. Activity in any open tab keeps the session going; the server ends idle sessions too, and staff sign in again at least every 12 hours. Parents and learners stay signed in on their phones. |
| **Activity log** | Administrator | **Activity log** in the menu shows who signed in (and failed to), and who changed people, passwords, fees, results, imports, backups, documents, settings and announcements, with when and from which address. Filter by type or person, or search. Kept with the data (encrypted and backed up with it); the newest 5,000 entries are kept. **Erase the log** clears it after the administrator types their sign-in password: a backup is made first, and the log restarts with one entry recording who erased it and how many entries. |
| **Erase everything (Danger zone)** | Administrator | At the bottom of Setup → Connections & security. Erases all learners, parents and staff (except the administrator), classes, fees and payments, results, announcements, posters, WhatsApp history, documents, assignments, AI history, and the school's details and logo; settings and backups stay. Needs the sign-in password, the two-step code (when it's on) and the school's name typed exactly; wrong attempts are rate-limited. A **Before erase** backup is made first (School Admin → Backups → Restore undoes it), administrators are told on WhatsApp and their phones, and the activity log records it. |
| **Results for parents (every assessment)** | Parents, teachers | Teachers mark each assessment as a **quiz / CAT / test, opener, mid-term, end-term or other**, and can mark it **out of a number** (e.g. 20): they type marks and the CBC level is worked out on KNEC's eight-level rubric (EE1 90%+, EE2 75%+, ME1 58%+, ME2 41%+, AE1 31%+, AE2 21%+, BE1 11%+, BE2 below). Typing a level still works, and result files can hold marks too. Parents get **Results** in the menu: every assessment for each child, newest first, filtered by type, with marks, levels, an overall level, the teacher's comment, and a **progress by learning area** table showing whether each subject went up or down. WhatsApp (reply 1) shows the latest, with marks. The school's trend charts keep to the main exams. |
| **AI budget guard (manual mode)** | Administrator | Setup → Connections & security → **AI budget** shows this month's AI spending in shillings (worked out from the tokens Claude reports for every call; about KSh 130 to the dollar), how many AI answers that was, last month, and where the money went. Set a **monthly limit**: the administrator is warned on WhatsApp (and in the activity log and on the dashboard) at 80%, and at the limit the AI **pauses until next month**. A tick box **switches the AI off** any time. While paused, or if Claude reports the credit has run out, the system carries on in manual mode: the WhatsApp menu still gives fees and results from the data, other questions get "the office will get back to you" and wait in the WhatsApp inbox, the director's brief goes out as plain figures, and AI pages say the AI is paused. When credit is added, the AI resumes by itself. |
| **Onboarding (Setup)** | Administrator | **Setup → Onboarding** gathers everything for a new school in one place: a progress checklist (details, logo, learners, staff, fees, facts, AI, WhatsApp, encryption, off-site backup) with links to each; the school's name, motto, website, phone, email and address; the **logo** (shown on the sign-in page and in the menu; the name typed here replaces `SCHOOL_NAME` everywhere); the class-list import; and **Documents**, where the director's instructions, policies, fee structures and lists are kept (PDF, Word, Excel, PowerPoint, CSV, text or pictures, up to 15 MB; checked by content, administrator-only, always downloaded rather than opened in the app, and encrypted when `DATA_ENCRYPTION_KEY` is set). Connections and tests are under **Setup → Connections & security**. Every spreadsheet upload (class list, results, fees) takes Excel `.xlsx` files directly as well as CSV; Excel dates are understood. |
| **Dashboard charts** | Director, headteacher, secretary, administrator | Modern, interactive charts on the dashboard (hover or tab to a bar or point for its figures; **Show as a table** under each). **School performance**: the share of results at Meeting or Exceeding Expectations in each exam, with the change since the last one. **Performance by class**: each class's spread of CBC levels in the latest exam. **Fees collected**: payments received each month over the last 12 months. **Fees by class**: what each class has paid and still owes. The director and administrator see all four, the headteacher the two on performance, the secretary the two on fees. Colours work in both themes and for colour-blind readers. |
| **Light and dark theme** | Everyone | A soft-white light theme by default (even on devices set to dark mode), and a **🌙 Dark / ☀️ Light** button on the sign-in page and under each person's name in the menu. The choice is remembered on that device. |
| **Sign-in page** | Everyone | The school's name, the sign-in form on the left and an animated picture of learners walking to school as the school bus drives past (still for people who prefer reduced motion); on phones the picture sits above the form. **Forgot your password?** takes the person's name, role and email or phone: the administrator gets it on WhatsApp and on their dashboard (**Password help**) with the matching account, and **Reset password** gives a temporary one to pass on (the person chooses their own at sign-in). The reply never says whether the details matched an account, and requests are limited per person and per address. |
| **Accounts & security** | Everyone | The sign-in page has a Role list (Director, Headteacher, Secretary, Teacher, Parent, Student, Administrator) and adjusts the form; the account itself still decides what each person can do, and picking the wrong role just switches it to the right one. New and reset accounts get a temporary password that must be changed at first sign-in. Staff sign in with email; parents and students can sign in with email or phone number. Anyone can change their password and WhatsApp number under **My account**; changing or resetting a password signs out the account's other sessions. Repeated failed sign-ins are locked out (5 per account or 20 per IP address in 15 minutes). |

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
| Headteacher | headteacher@schoolsync.test |
| Secretary | secretary@schoolsync.test |
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
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | First production start | Creates the administrator account (the system owner; an existing director with this email is upgraded to administrator). Production starts with an empty school (no demo accounts) unless `SEED_DEMO=1`. |
| `SESSION_SECRET` | In production | Signs session cookies. Generate with `openssl rand -hex 32`. |
| `ANTHROPIC_API_KEY` | For AI features | Enables the assistant, AI drafting and WhatsApp auto-replies. Without it those features are hidden or fall back to a canned reply. |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | For live WhatsApp | Without them the app runs in **simulation mode**: messages are logged on the WhatsApp page but not sent. |
| `WHATSAPP_VERIFY_TOKEN` | For the webhook | Token Meta sends during webhook verification. |
| `WHATSAPP_APP_SECRET` | For the webhook in production | Verifies `X-Hub-Signature-256` on incoming webhooks. Required in production. |
| `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANGUAGE` | For reaching every parent | Approved template used for announcements to people outside the 24-hour window (language defaults to `en`). |
| `MPESA_SHORTCODE` | For M-Pesa | The school's Paybill number. Shown to parents who owe, with the learner's admission number as the account. |
| `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET` | For M-Pesa | From your app at developer.safaricom.co.ke. Used only to register the payment address (Setup → Register with Safaricom). |
| `MPESA_CALLBACK_TOKEN` | For M-Pesa | A long random secret (`openssl rand -hex 16`). Safaricom doesn't sign its notifications, so this secret in the payment address keeps it private. |
| `MPESA_ENV` | For live payments | `production` for the live Paybill; anything else uses Safaricom's sandbox. |
| `DATA_ENCRYPTION_KEY` | Recommended | Encrypts the data and backups (32+ characters; use **Generate a key** on Setup). **Keep a safe copy**: without it, the data and backups can't be opened. `DATA_ENCRYPTION_KEY_PREVIOUS` holds the old key while changing it. |
| `OFFSITE_BACKUP_ENDPOINT`, `OFFSITE_BACKUP_BUCKET`, `OFFSITE_BACKUP_ACCESS_KEY_ID`, `OFFSITE_BACKUP_SECRET_ACCESS_KEY` | Recommended | Daily encrypted copy in S3-compatible storage, e.g. Cloudflare R2: endpoint `https://<account-id>.r2.cloudflarestorage.com`, plus a bucket and an API token with write access to it. Optional: `OFFSITE_BACKUP_REGION` (default `auto`), `OFFSITE_BACKUP_PREFIX` (default `schoolsync`). |
| `MORNING_BRIEF_TIME`, `MORNING_BRIEF_DAYS` | No | When directors get the automatic morning brief on WhatsApp (default `07:00`, weekdays; `off` to stop). |
| `DEFAULT_COUNTRY_CODE` | Recommended | Country code (e.g. `254`) used to convert local phone numbers like `0712 345 678` to international form, so parents can sign in with either. |
| `SCHOOL_NAME` | Recommended | Shown at the top of the director's brief and at the end of WhatsApp announcements. |
| `CURRENCY_LABEL` | No | Shown before amounts (default `Ksh`). |
| `DATA_FILE` | No | Path of the JSON datastore (default `data/db.json`). |
| `PUBLIC_URL` | No | The site's public address, used by the Setup page's webhook test. On Render, `RENDER_EXTERNAL_URL` is used automatically. |
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
    importer.ts, importFormat.ts        CSV class-list import
    phone.ts                            phone number normalisation
    backup.ts                           snapshots, retention, restore validation
    hub.ts, brief.ts                    WhatsApp menu routing and the director's brief
    results.ts, cbc.ts, fees.ts         CBC results and fee statements
    facts.ts, factImages.ts             School facts, their pictures and how the AI sees them
    mpesa.ts, daraja.ts, payments.ts    M-Pesa matching, Safaricom Daraja client, receipts
    reminders.ts, sendReminders.ts      fee reminders (plan, preview, send)
    adminAi/                            Admin AI and the directors' School AI: tools, approvals, conversation loop
    morningBrief.ts, scheduler.ts       the directors' automatic morning brief (started from instrumentation.ts)
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

The repo includes a `render.yaml` Blueprint that creates the web service (in Render's Frankfurt region, the closest to East Africa; change `region` before the first deploy if your school is elsewhere) and a 1 GB persistent disk for the datastore. Serverless hosts such as Vercel are not suitable as-is, because their file system doesn't persist between requests.

1. Sign in at https://dashboard.render.com with GitHub and allow Render to access this repository.
2. Click **New → Blueprint**, pick `schoolsync-ai`, and click **Apply**.
3. When prompted, fill in `ADMIN_NAME`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` (8+ characters) for the administrator account. `ANTHROPIC_API_KEY` and the `WHATSAPP_*` values are optional and can be added later under **Environment**.
4. Wait for the deploy to finish, open the `onrender.com` URL, and sign in as the director.
5. In **School Admin**, add classes and teachers first, then students, then parents (with WhatsApp numbers).

The Starter instance plus disk costs roughly US$7–8/month. Every push to `main` redeploys automatically; the data on the disk is kept. To use your own domain, add it under the service's **Settings → Custom Domains**.

## Automatic checks

`.github/workflows/ci.yml` runs on every pull request and every push to `main`: a clean install, `npm run lint`, `npm test` and `npm run build` on Node 22. To stop a failing change from being merged, turn on **Settings → Branches → Add branch protection rule** for `main` with **Require status checks to pass** and select **Type-check, test and build**.

## Production notes

Backups are stored in a `backups` folder next to the data file (on Render, on the same persistent disk). They protect against mistakes such as a bad import, but not against losing the disk, so download a copy from **School Admin → Backups** regularly and keep it somewhere safe. Backups contain everyone's details and password hashes; treat them as private.

The sign-in lockout is kept in server memory, so it resets when the app restarts. That's fine for one instance; with several instances it would need shared storage.

The JSON datastore suits a single school on a single server instance. For multiple instances or larger schools, swap `src/lib/db.ts` for a real database such as Postgres; the rest of the app only uses `readDb` / `mutateDb`.
