import type Anthropic from "@anthropic-ai/sdk";
import { HttpError } from "../errors.ts";
import { feeStatement, schoolFees } from "../fees.ts";
import { phoneKey } from "../phone.ts";
import type { Database, User } from "../types.ts";
import type { ToolContext } from "./tools.ts";

/**
 * The director's School AI: read-only, and only about the school (fees,
 * payments, events, activities) and its families. Anything about the system
 * itself is forwarded to the administrator with forward_to_admin.
 */

const obj = (properties: Record<string, unknown>) => ({
  type: "object" as const,
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const DIRECTOR_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "fees_overview",
    description: "School fees at a glance: total charged, collected and outstanding; collected in the last N days; outstanding by class; and the learners who owe most.",
    input_schema: obj({ days: { type: "integer", description: "Days back for 'collected recently' (1-90)" } }),
  },
  {
    name: "find_family",
    description: "Find learners and parents by name, phone number or admission number. Learners come with class, admission number, fee balance and parents; parents with their children and balances.",
    input_schema: obj({ query: { type: "string" } }),
  },
  {
    name: "fee_statement",
    description: "One learner's fee statement: every charge and payment (term, date, M-Pesa reference) and the balance per term.",
    input_schema: obj({ student_id: { type: "string" } }),
  },
  {
    name: "recent_payments",
    description: "Recent fee payments (M-Pesa and recorded by hand), newest first, and M-Pesa payments still waiting to be matched to a learner.",
    input_schema: obj({ days: { type: "integer", description: "Days back (1-90)" } }),
  },
  {
    name: "events_and_activities",
    description: "The school calendar (upcoming and recent events) and recent announcements sent to parents, teachers and learners.",
    input_schema: obj({ days_back: { type: "integer", description: "How far back to include past events and announcements (0-90)" } }),
  },
  {
    name: "parent_messages",
    description: "What parents have written to the school on WhatsApp in the last N days, with the parent's name and children, newest first.",
    input_schema: obj({ days: { type: "integer", description: "Days back (1-30)" } }),
  },
  {
    name: "forward_to_admin",
    description:
      "Pass a question to the administrator when it's about the SchoolSync system itself rather than the school: accounts, passwords, sign-in, settings, WhatsApp or M-Pesa not working, errors, AI behaviour, new features, or anything you can't answer from the school's data.",
    input_schema: obj({
      question: { type: "string", description: "The director's question in their words" },
      details: { type: "string", description: "Short context that will help the administrator" },
    }),
  },
].map((t) => ({ ...t, strict: true }) as Anthropic.Beta.BetaTool);

const clamp = (v: unknown, lo: number, hi: number, dflt: number) => Math.min(hi, Math.max(lo, Number.isFinite(Number(v)) ? Math.round(Number(v)) : dflt));
const DAY = 86_400_000;

function className(db: Database, u: User): string | null {
  return db.classes.find((c) => u.classIds.includes(c.id))?.name ?? null;
}

function learnerView(db: Database, s: User) {
  return {
    id: s.id,
    learner: s.name,
    class: className(db, s),
    admissionNo: s.admissionNo ?? null,
    balance: feeStatement(db, s.id).balance,
    parents: db.users.filter((p) => p.role === "parent" && p.childIds.includes(s.id)).map((p) => ({ name: p.name, phone: p.phone ?? null })),
  };
}

export function runDirectorTool(ctx: ToolContext, name: string, input: Record<string, unknown>): unknown {
  const { db, now } = ctx;
  switch (name) {
    case "fees_overview": {
      const days = clamp(input.days, 1, 90, 7);
      const f = schoolFees(db, new Date(now - days * DAY).toISOString());
      const owing = db.users
        .filter((u) => u.role === "student")
        .map((s) => ({ learner: s.name, class: className(db, s), balance: feeStatement(db, s.id).balance }))
        .filter((x) => x.balance > 0)
        .sort((a, b) => b.balance - a.balance);
      return {
        charged: f.charged,
        collected: f.paid,
        outstanding: f.outstanding,
        [`collectedLast${days}Days`]: f.collectedSince,
        paymentsLastPeriod: f.paymentsSince,
        outstandingByClass: f.byClass,
        learnersOwing: owing.length,
        topOwing: owing.slice(0, 20),
      };
    }
    case "find_family": {
      const q = String(input.query ?? "").trim().toLowerCase();
      if (!q) throw new HttpError(400, "Give a name, phone or admission number");
      const key = phoneKey(q);
      const adm = q.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const match = (u: User) =>
        u.name.toLowerCase().includes(q) || (key.length >= 6 && phoneKey(u.phone).endsWith(key.slice(-9))) || (!!adm && (u.admissionNo ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "") === adm);
      const learners = db.users.filter((u) => u.role === "student" && match(u)).slice(0, 15).map((s) => learnerView(db, s));
      const parents = db.users
        .filter((u) => u.role === "parent" && match(u))
        .slice(0, 15)
        .map((p) => ({ parent: p.name, phone: p.phone ?? null, children: db.users.filter((s) => p.childIds.includes(s.id)).map((s) => learnerView(db, s)) }));
      return { learners, parents };
    }
    case "fee_statement": {
      const s = db.users.find((u) => u.id === input.student_id && u.role === "student");
      if (!s) throw new HttpError(404, "No learner with that id; use find_family first");
      const st = feeStatement(db, s.id);
      return { learner: s.name, class: className(db, s), balance: st.balance, terms: st.terms, entries: st.entries.map((e) => ({ kind: e.kind, amount: e.amount, term: e.term, date: e.date, reference: e.reference, note: e.note })) };
    }
    case "recent_payments": {
      const days = clamp(input.days, 1, 90, 7);
      const since = new Date(now - days * DAY).toISOString().slice(0, 10);
      const names = new Map(db.users.map((u) => [u.id, u.name]));
      const payments = db.fees
        .filter((f) => f.kind === "payment" && f.date >= since)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 40)
        .map((f) => ({ learner: names.get(f.studentId) ?? f.studentId, amount: f.amount, date: f.date, reference: f.reference, via: f.source === "mpesa" ? "M-Pesa (automatic)" : f.source }));
      const waiting = db.mpesaPayments.filter((p) => p.status === "unmatched").map((p) => ({ amount: p.amount, account: p.account, payer: p.payerName, paidAt: p.paidAt, ref: p.transId }));
      return { payments, total: payments.reduce((s, p) => s + p.amount, 0), mpesaWaitingForALearner: waiting };
    }
    case "events_and_activities": {
      const back = clamp(input.days_back, 0, 90, 14);
      const from = new Date(now - back * DAY).toISOString().slice(0, 10);
      const today = new Date(now).toISOString().slice(0, 10);
      const classes = new Map(db.classes.map((c) => [c.id, c.name]));
      const events = [...db.events].filter((e) => e.date >= from).sort((a, b) => a.date.localeCompare(b.date));
      return {
        upcoming: events.filter((e) => e.date >= today).map(({ title, date, description }) => ({ title, date, description })),
        recentPast: events.filter((e) => e.date < today).map(({ title, date, description }) => ({ title, date, description })),
        announcements: db.announcements
          .filter((a) => a.createdAt.slice(0, 10) >= from)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 20)
          .map((a) => ({ title: a.title, body: a.body.slice(0, 400), for: a.audience, class: a.classId ? classes.get(a.classId) ?? null : "Whole school", urgent: a.priority === "urgent", date: a.createdAt.slice(0, 10), sentOnWhatsApp: Boolean(a.whatsappSentAt) })),
      };
    }
    case "parent_messages": {
      const days = clamp(input.days, 1, 30, 7);
      const since = new Date(now - days * DAY).toISOString();
      const parents = new Map(db.users.filter((u) => u.role === "parent").map((p) => [p.id, p]));
      const msgs = db.whatsappMessages
        .filter((m) => m.direction === "inbound" && m.createdAt >= since && m.userId && parents.has(m.userId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 50)
        .map((m) => {
          const p = parents.get(m.userId!)!;
          return { parent: p.name, children: db.users.filter((s) => p.childIds.includes(s.id)).map((s) => s.name), at: m.createdAt, text: m.body.slice(0, 500) };
        });
      return { count: msgs.length, messages: msgs };
    }
    default:
      throw new HttpError(400, `Unknown tool ${name}`);
  }
}
