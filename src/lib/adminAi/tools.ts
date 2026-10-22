import type Anthropic from "@anthropic-ai/sdk";
import { darajaConfig, mpesaReceiving } from "../daraja.ts";
import { HttpError } from "../errors.ts";
import { feeStatement } from "../fees.ts";
import { ROLE_LABELS } from "../permissions.ts";
import { canonicalPhone, phoneKey } from "../phone.ts";
import { loginLimiter } from "../rateLimit.ts";
import { setupChecklist } from "../setupStatus.ts";
import { ROLES, type AdminAction, type AdminActionKind, type Database, type User } from "../types.ts";
import { webhookActivity } from "../webhookActivity.ts";
import { templateConfig, whatsappConfigured, withinServiceWindow } from "../whatsapp.ts";

/**
 * The admin AI's tools. Read tools run straight away and only look; propose_*
 * tools never change anything: they record an AdminAction that runs only when
 * the administrator clicks Approve (see actions.ts).
 */

export interface ToolContext {
  db: Database;
  env: Record<string, string | undefined>;
  lastBackupAt: string | null;
  now: number;
}

// Strict tool schemas support anyOf (not type arrays), so "or null" is spelled out.
const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };
const obj = (properties: Record<string, unknown>) => ({
  type: "object" as const,
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const ADMIN_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "setup_status",
    description:
      "Settings and connections: which settings are ready or missing (Claude, WhatsApp, M-Pesa, backups, basics), when Meta last verified or used the webhook, and how many people and classes exist. Start here for anything that 'isn't working'.",
    input_schema: obj({}),
  },
  {
    name: "health_check",
    description:
      "Scans the school's data for common problems: parents without a WhatsApp number or children, learners without a class, parent or admission number, unmatched M-Pesa payments, failed WhatsApp messages in the last 7 days, locked-out sign-ins, flagged AI answers. Use it for 'what needs fixing?'",
    input_schema: obj({}),
  },
  {
    name: "find_people",
    description: "Search people by name, email, phone number (any format) or admission number. Returns up to 15 matches with their ids.",
    input_schema: obj({
      query: { type: "string", description: "Part of a name, an email, a phone number or an admission number" },
      role: { anyOf: [{ type: "string", enum: [...ROLES] }, { type: "null" }], description: "Only this role, or null for any" },
    }),
  },
  {
    name: "person_details",
    description:
      "Everything about one person: role, contacts, classes, linked children or parents, admission number, whether they must change their password or are locked out, fee balance (learners and parents' children) and their 10 most recent WhatsApp messages.",
    input_schema: obj({ person_id: { type: "string" } }),
  },
  {
    name: "whatsapp_messages",
    description:
      "Recent WhatsApp messages (newest first) with delivery status and Meta's error text, for one phone number or person, or for everyone. Use to find out why someone didn't get a message.",
    input_schema: obj({
      phone: { ...nullableString, description: "A phone number in any format, or null" },
      person_id: { ...nullableString, description: "A person's id, or null" },
      only_failed: { type: "boolean", description: "Only messages that failed to send" },
      days: { type: "integer", description: "How many days back (1-90)" },
    }),
  },
  {
    name: "fee_statement",
    description: "A learner's fee statement: every charge and payment with term, date, M-Pesa reference and source, and the balance per term.",
    input_schema: obj({ student_id: { type: "string" } }),
  },
  {
    name: "mpesa_payments",
    description: "M-Pesa Paybill payments Safaricom reported: unmatched (waiting for a learner), recorded, ignored, or all; newest first, up to 30.",
    input_schema: obj({ status: { type: "string", enum: ["unmatched", "recorded", "ignored", "any"] } }),
  },
  {
    name: "propose_update_person",
    description:
      "Propose correcting a person's details. Nothing changes until the administrator approves. Pass null for every field that should stay as it is. child_ids replaces a parent's whole list of children; class_id sets a learner's class.",
    input_schema: obj({
      person_id: { type: "string" },
      name: nullableString,
      phone: { ...nullableString, description: "New WhatsApp number, or \"\" to remove it" },
      email: { ...nullableString, description: "New email, or \"\" to remove it (only for parents and learners)" },
      admission_no: { ...nullableString, description: "Learners only; \"\" to remove" },
      class_id: { ...nullableString, description: "Learners only: the class id" },
      child_ids: { anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }], description: "Parents only: the complete list of their children's ids" },
      reason: { type: "string", description: "One sentence on why, shown to the administrator" },
    }),
  },
  {
    name: "propose_reset_password",
    description:
      "Propose giving someone a new temporary password (they choose their own at next sign-in; their other sessions are signed out). The password is shown only to the administrator on screen, never to you.",
    input_schema: obj({ person_id: { type: "string" }, reason: { type: "string" } }),
  },
  {
    name: "propose_unlock_sign_in",
    description: "Propose clearing a sign-in lockout (after too many wrong passwords) so the person can try again now.",
    input_schema: obj({ person_id: { type: "string" }, reason: { type: "string" } }),
  },
  {
    name: "propose_match_payment",
    description: "Propose recording an unmatched M-Pesa payment for a learner. On approval it is added to their fees and the parents get a WhatsApp receipt.",
    input_schema: obj({ payment_id: { type: "string" }, student_id: { type: "string" }, reason: { type: "string" } }),
  },
  {
    name: "propose_resend_message",
    description: "Propose sending a failed or unsent outbound WhatsApp message again (only after the cause is fixed, e.g. a corrected number).",
    input_schema: obj({ message_id: { type: "string" }, reason: { type: "string" } }),
  },
  {
    name: "save_feature_request",
    description:
      "Save a new feature the administrator wants, written as a clear request for the developer. Use when they ask for something SchoolSync can't do yet. Confirm the details with them first.",
    input_schema: obj({
      title: { type: "string", description: "Short name, e.g. 'Attendance register'" },
      problem: { type: "string", description: "What the school needs and why, in the administrator's words" },
      proposal: { type: "string", description: "How it could work: who uses it, where, what they see, what should happen" },
    }),
  },
].map((t) => ({ ...t, strict: true }) as Anthropic.Beta.BetaTool);

/* ---------- helpers ---------- */

const str = (v: unknown) => (typeof v === "string" ? v : "");
const days = (n: number) => n * 86_400_000;

function person(db: Database, id: unknown): User {
  const u = db.users.find((x) => x.id === id);
  if (!u) throw new HttpError(404, `No person with id ${String(id)}. Use find_people to get the id.`);
  return u;
}

function signInNames(u: User): string[] {
  return [u.email, phoneKey(u.phone)].filter(Boolean).map((s) => s.toLowerCase());
}

function lockedUntil(u: User, now: number): string | null {
  const names = signInNames(u);
  const hit = loginLimiter.lockedAccounts(now).filter((l) => names.includes(l.account));
  return hit.length ? new Date(Math.max(...hit.map((h) => h.until))).toISOString() : null;
}

function brief(db: Database, u: User) {
  const classes = new Map(db.classes.map((c) => [c.id, c.name]));
  const names = (ids: string[]) => ids.map((id) => db.users.find((x) => x.id === id)?.name ?? id);
  return {
    id: u.id,
    name: u.name,
    role: ROLE_LABELS[u.role],
    email: u.email || null,
    phone: u.phone ?? null,
    ...(u.role === "student" ? { admissionNo: u.admissionNo ?? null, parents: db.users.filter((p) => p.childIds.includes(u.id)).map((p) => p.name) } : {}),
    ...(u.classIds.length ? { classes: u.classIds.map((id) => classes.get(id) ?? id) } : {}),
    ...(u.role === "parent" ? { children: names(u.childIds) } : {}),
  };
}

function messageView(m: Database["whatsappMessages"][number]) {
  return {
    id: m.id,
    at: m.createdAt,
    direction: m.direction,
    phone: m.phone,
    status: m.status,
    error: m.error,
    kind: m.kind ?? "text",
    purpose: m.purpose ?? null,
    text: m.body.length > 300 ? `${m.body.slice(0, 300)}…` : m.body,
  };
}

/* ---------- read tools ---------- */

function setupStatus(ctx: ToolContext) {
  const { db, env } = ctx;
  const sections = setupChecklist(env, { lastBackupAt: ctx.lastBackupAt, now: ctx.now });
  const activity = webhookActivity();
  return {
    checklist: sections.map((s) => ({ section: s.title, items: s.items.map((i) => ({ setting: i.envVar ?? i.label, label: i.label, status: i.status, detail: i.detail })) })),
    claudeConnected: Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN),
    whatsapp: {
      live: whatsappConfigured(),
      note: whatsappConfigured() ? "Messages are really sent." : "Simulation mode: messages are logged on the WhatsApp page but NOT sent to phones.",
      templateForParentsOutside24h: templateConfig()?.name ?? null,
      metaLastVerifiedWebhook: activity.verifiedAt,
      metaLastDelivered: activity.receivedAt,
    },
    mpesa: { receiving: mpesaReceiving(env), paybill: darajaConfig(env).shortCode || null, sandbox: darajaConfig(env).sandbox },
    lastBackupAt: ctx.lastBackupAt,
    counts: Object.fromEntries([...ROLES.map((r) => [r, db.users.filter((u) => u.role === r).length]), ["classes", db.classes.length]]),
  };
}

function healthCheck(ctx: ToolContext) {
  const { db, now } = ctx;
  const sample = (list: User[]) => ({ count: list.length, examples: list.slice(0, 10).map((u) => ({ id: u.id, name: u.name })) });
  const parents = db.users.filter((u) => u.role === "parent");
  const students = db.users.filter((u) => u.role === "student");
  const failed = db.whatsappMessages.filter((m) => m.status === "failed" && Date.parse(m.createdAt) > now - days(7));
  const errors = new Map<string, number>();
  for (const m of failed) errors.set(m.error ?? "unknown", (errors.get(m.error ?? "unknown") ?? 0) + 1);
  const unknownSenders = new Set(db.whatsappMessages.filter((m) => m.direction === "inbound" && !m.userId && Date.parse(m.createdAt) > now - days(30)).map((m) => m.phone));
  return {
    parentsWithoutWhatsApp: sample(parents.filter((u) => !u.phone)),
    parentsWithoutChildren: sample(parents.filter((u) => u.childIds.length === 0)),
    learnersWithoutClass: sample(students.filter((u) => u.classIds.length === 0)),
    learnersWithoutParent: sample(students.filter((s) => !parents.some((p) => p.childIds.includes(s.id)))),
    learnersWithoutAdmissionNo: sample(students.filter((u) => !u.admissionNo)),
    classesWithoutTeacher: db.classes.filter((c) => !c.teacherId).map((c) => c.name),
    unmatchedMpesaPayments: db.mpesaPayments.filter((p) => p.status === "unmatched").length,
    failedWhatsAppLast7Days: { count: failed.length, byError: [...errors].map(([error, count]) => ({ error, count })).slice(0, 5) },
    unknownNumbersMessagedLast30Days: [...unknownSenders].slice(0, 10),
    lockedOutSignIns: loginLimiter.lockedAccounts(now).map((l) => l.account),
    peopleWhoMustChangePassword: db.users.filter((u) => u.mustChangePassword).length,
    aiAnswersFlaggedWrong: db.aiLogs.filter((l) => l.flagged && !l.factId).length,
    pendingAdminActions: db.adminActions.filter((a) => a.status === "pending").length,
  };
}

function findPeople(ctx: ToolContext, input: Record<string, unknown>) {
  const q = str(input.query).trim().toLowerCase();
  if (!q) throw new HttpError(400, "Give a name, email, phone or admission number to search for");
  const key = phoneKey(q);
  const adm = q.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const role = typeof input.role === "string" ? input.role : null;
  const hits = ctx.db.users.filter(
    (u) =>
      (!role || u.role === role) &&
      (u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (key.length >= 6 && phoneKey(u.phone).endsWith(key.slice(-9))) ||
        (adm.length > 0 && (u.admissionNo ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "") === adm)),
  );
  return { matches: hits.slice(0, 15).map((u) => brief(ctx.db, u)), more: Math.max(0, hits.length - 15) };
}

function personDetails(ctx: ToolContext, input: Record<string, unknown>) {
  const { db, now } = ctx;
  const u = person(db, input.person_id);
  const key = phoneKey(u.phone);
  const messages = db.whatsappMessages.filter((m) => m.userId === u.id || (key && m.phone === key)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const lastInbound = messages.find((m) => m.direction === "inbound")?.createdAt ?? null;
  const balances = (u.role === "student" ? [u.id] : u.role === "parent" ? u.childIds : []).map((id) => ({
    learner: db.users.find((x) => x.id === id)?.name ?? id,
    balance: feeStatement(db, id).balance,
  }));
  return {
    ...brief(db, u),
    signsInWith: u.role === "parent" || u.role === "student" ? "email or phone number" : "email",
    mustChangePassword: Boolean(u.mustChangePassword),
    lockedOutUntil: lockedUntil(u, now),
    phoneLooksValid: u.phone ? canonicalPhone(u.phone) !== null : null,
    whatsappWindow: lastInbound
      ? { lastMessagedSchool: lastInbound, canReceiveNormalMessages: withinServiceWindow(lastInbound, now) }
      : { lastMessagedSchool: null, canReceiveNormalMessages: false, note: "Has never messaged the school: only the approved template reaches them." },
    ...(balances.length ? { feeBalances: balances } : {}),
    recentWhatsApp: messages.slice(0, 10).map(messageView),
  };
}

function whatsappMessages(ctx: ToolContext, input: Record<string, unknown>) {
  const { db, now } = ctx;
  const n = Math.min(90, Math.max(1, Number(input.days) || 7));
  let list = db.whatsappMessages.filter((m) => Date.parse(m.createdAt) > now - days(n));
  if (typeof input.person_id === "string" && input.person_id) {
    const u = person(db, input.person_id);
    const key = phoneKey(u.phone);
    list = list.filter((m) => m.userId === u.id || (key && m.phone === key));
  }
  if (typeof input.phone === "string" && input.phone) {
    const key = phoneKey(input.phone);
    list = list.filter((m) => m.phone === key || m.phone.endsWith(key.slice(-9)));
  }
  if (input.only_failed) list = list.filter((m) => m.status === "failed");
  list = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { total: list.length, messages: list.slice(0, 40).map(messageView) };
}

function feeStatementTool(ctx: ToolContext, input: Record<string, unknown>) {
  const u = person(ctx.db, input.student_id);
  if (u.role !== "student") throw new HttpError(400, `${u.name} is a ${ROLE_LABELS[u.role]}, not a learner`);
  const st = feeStatement(ctx.db, u.id);
  return { learner: u.name, admissionNo: u.admissionNo ?? null, ...st, entries: st.entries.map(({ createdBy: _c, ...e }) => e) };
}

function mpesaPayments(ctx: ToolContext, input: Record<string, unknown>) {
  const status = str(input.status) || "any";
  const names = new Map(ctx.db.users.map((u) => [u.id, u.name]));
  const list = ctx.db.mpesaPayments.filter((p) => status === "any" || p.status === status).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  return {
    total: list.length,
    payments: list.slice(0, 30).map((p) => ({ ...p, learner: p.studentId ? names.get(p.studentId) ?? p.studentId : null })),
  };
}

/* ---------- proposals ---------- */

export interface Proposal {
  kind: AdminActionKind;
  input: Record<string, unknown>;
  summary: string;
  reason: string;
}

/** Check a proposal makes sense now and describe it; nothing is changed. */
export function buildProposal(db: Database, name: string, input: Record<string, unknown>): Proposal {
  const reason = str(input.reason).trim().slice(0, 300) || "Suggested by the admin AI";
  switch (name) {
    case "propose_update_person": {
      const u = person(db, input.person_id);
      if (u.role === "admin") throw new HttpError(400, "Administrator accounts are changed under My account, not by the AI");
      const changes: string[] = [];
      const clean: Record<string, unknown> = { person_id: u.id };
      const field = (key: string, label: string) => {
        if (typeof input[key] === "string") {
          clean[key] = input[key];
          changes.push(input[key] === "" ? `remove ${label}` : `${label} → ${input[key]}`);
        }
      };
      field("name", "name");
      field("phone", "WhatsApp number");
      field("email", "email");
      field("admission_no", "admission number");
      if (typeof input.class_id === "string") {
        const c = db.classes.find((x) => x.id === input.class_id);
        if (!c) throw new HttpError(400, `No class with id ${input.class_id}`);
        clean.class_id = c.id;
        changes.push(`class → ${c.name}`);
      }
      if (Array.isArray(input.child_ids)) {
        const kids = input.child_ids.map((id) => person(db, id));
        if (kids.some((k) => k.role !== "student")) throw new HttpError(400, "child_ids must all be learners");
        clean.child_ids = kids.map((k) => k.id);
        changes.push(`children → ${kids.map((k) => k.name).join(", ") || "none"}`);
      }
      if (changes.length === 0) throw new HttpError(400, "Nothing to change: pass at least one field that isn't null");
      return { kind: "update_person", input: clean, summary: `Update ${u.name} (${ROLE_LABELS[u.role]}): ${changes.join("; ")}`, reason };
    }
    case "propose_reset_password": {
      const u = person(db, input.person_id);
      if (u.role === "admin") throw new HttpError(400, "The administrator changes their own password under My account");
      return { kind: "reset_password", input: { person_id: u.id }, summary: `Give ${u.name} a new temporary password`, reason };
    }
    case "propose_unlock_sign_in": {
      const u = person(db, input.person_id);
      return { kind: "unlock_sign_in", input: { person_id: u.id }, summary: `Clear the sign-in lockout for ${u.name}`, reason };
    }
    case "propose_match_payment": {
      const p = db.mpesaPayments.find((x) => x.id === input.payment_id);
      if (!p) throw new HttpError(404, `No M-Pesa payment with id ${String(input.payment_id)}`);
      if (p.status === "recorded") throw new HttpError(409, "That payment is already recorded");
      const s = person(db, input.student_id);
      if (s.role !== "student") throw new HttpError(400, `${s.name} isn't a learner`);
      return {
        kind: "match_payment",
        input: { payment_id: p.id, student_id: s.id },
        summary: `Record M-Pesa ${p.transId} (Ksh ${p.amount.toLocaleString("en-US")}, account "${p.account}") for ${s.name} and send the parents a receipt`,
        reason,
      };
    }
    case "propose_resend_message": {
      const m = db.whatsappMessages.find((x) => x.id === input.message_id);
      if (!m) throw new HttpError(404, `No WhatsApp message with id ${String(input.message_id)}`);
      if (m.direction !== "outbound") throw new HttpError(400, "Only messages the school sent can be resent");
      const who = db.users.find((u) => u.id === m.userId)?.name ?? `+${m.phone}`;
      return { kind: "resend_message", input: { message_id: m.id }, summary: `Resend to ${who}: "${m.body.slice(0, 80)}${m.body.length > 80 ? "…" : ""}"`, reason };
    }
    default:
      throw new HttpError(400, `Unknown proposal ${name}`);
  }
}

export function newAction(p: Proposal, now = new Date()): AdminAction {
  return {
    id: `act-${crypto.randomUUID().slice(0, 8)}`,
    ...p,
    status: "pending",
    result: null,
    proposedAt: now.toISOString(),
    decidedAt: null,
    decidedBy: null,
  };
}

/** Run a read tool. Throws HttpError for bad input (reported to the AI as a tool error). */
export function runReadTool(ctx: ToolContext, name: string, input: Record<string, unknown>): unknown {
  switch (name) {
    case "setup_status":
      return setupStatus(ctx);
    case "health_check":
      return healthCheck(ctx);
    case "find_people":
      return findPeople(ctx, input);
    case "person_details":
      return personDetails(ctx, input);
    case "whatsapp_messages":
      return whatsappMessages(ctx, input);
    case "fee_statement":
      return feeStatementTool(ctx, input);
    case "mpesa_payments":
      return mpesaPayments(ctx, input);
    default:
      throw new HttpError(400, `Unknown tool ${name}`);
  }
}

export const isProposal = (name: string) => name.startsWith("propose_");
