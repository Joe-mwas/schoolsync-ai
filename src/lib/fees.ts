import { HttpError } from "./errors.ts";
import { parseCsv } from "./importer.ts";
import type { Database, FeeEntry, FeeSource, User } from "./types.ts";

/** Shown before amounts, e.g. "Ksh 12,000". */
export function currencyLabel(env: Record<string, string | undefined> = process.env): string {
  return env.CURRENCY_LABEL?.trim() || "Ksh";
}

export function formatMoney(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}${currencyLabel()} ${Math.abs(Math.round(amount)).toLocaleString("en-US")}`;
}

/** Parse "12,000", "Ksh 12000", "12000.00"; null if it isn't a non-negative amount. */
export function parseAmount(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : null;
  if (typeof raw !== "string") return null;
  const t = raw.replace(/[^\d.]/g, "");
  if (!t || (t.match(/\./g) ?? []).length > 1) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export interface TermBalance {
  term: string;
  charged: number;
  paid: number;
  balance: number;
}

export interface FeeStatement {
  charged: number;
  paid: number;
  /** Positive: owed to the school. Negative: overpaid (credit). */
  balance: number;
  terms: TermBalance[];
  entries: FeeEntry[];
}

export function feeStatement(db: Pick<Database, "fees">, studentId: string): FeeStatement {
  const entries = db.fees.filter((f) => f.studentId === studentId).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const terms = new Map<string, TermBalance>();
  for (const e of entries) {
    const t = terms.get(e.term) ?? { term: e.term, charged: 0, paid: 0, balance: 0 };
    if (e.kind === "charge") t.charged += e.amount;
    else t.paid += e.amount;
    t.balance = t.charged - t.paid;
    terms.set(e.term, t);
  }
  const charged = entries.filter((e) => e.kind === "charge").reduce((s, e) => s + e.amount, 0);
  const paid = entries.filter((e) => e.kind === "payment").reduce((s, e) => s + e.amount, 0);
  return { charged, paid, balance: charged - paid, terms: [...terms.values()], entries };
}

export function formatFeeStatement(studentName: string, st: FeeStatement): string {
  if (st.entries.length === 0) return `${studentName}: no fee records yet.`;
  const lastPayment = [...st.entries].reverse().find((e) => e.kind === "payment");
  const status =
    st.balance > 0 ? `Balance due: ${formatMoney(st.balance)}` : st.balance < 0 ? `Credit (overpaid): ${formatMoney(-st.balance)}` : "Fully paid ✅";
  return [
    `💰 ${studentName}`,
    `Total fees: ${formatMoney(st.charged)}`,
    `Paid: ${formatMoney(st.paid)}`,
    status,
    lastPayment ? `Last payment: ${formatMoney(lastPayment.amount)} on ${lastPayment.date}${lastPayment.reference ? ` (ref ${lastPayment.reference})` : ""}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const today = () => new Date().toISOString().slice(0, 10);

export interface EntryInput {
  studentId?: unknown;
  kind?: unknown;
  amount?: unknown;
  term?: unknown;
  date?: unknown;
  reference?: unknown;
  note?: unknown;
}

function validEntry(db: Database, actor: User, input: EntryInput, source: FeeSource): FeeEntry {
  const student = db.users.find((u) => u.id === input.studentId && u.role === "student");
  if (!student) throw new HttpError(400, "Unknown learner");
  if (input.kind !== "charge" && input.kind !== "payment") throw new HttpError(400, "Choose charge or payment");
  const amount = parseAmount(input.amount);
  if (!amount) throw new HttpError(400, "Enter an amount greater than zero");
  const term = typeof input.term === "string" ? input.term.trim() : "";
  if (!term) throw new HttpError(400, "Enter the term, e.g. Term 1 2027");
  const date = typeof input.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : today();
  const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  return {
    id: `f-${crypto.randomUUID().slice(0, 8)}`,
    studentId: student.id,
    term,
    kind: input.kind,
    amount,
    date,
    reference: text(input.reference, 60),
    note: text(input.note, 200),
    source,
    createdBy: actor.id,
    createdAt: new Date().toISOString(),
  };
}

/** Record one payment or charge by hand. */
export function addFeeEntry(db: Database, actor: User, input: EntryInput): FeeEntry {
  const entry = validEntry(db, actor, input, "manual");
  if (entry.kind === "payment" && entry.reference) {
    const dup = db.fees.find((f) => f.kind === "payment" && f.reference?.toLowerCase() === entry.reference!.toLowerCase());
    if (dup) throw new HttpError(409, `Payment reference ${entry.reference} is already recorded`);
  }
  db.fees.push(entry);
  return entry;
}

export function deleteFeeEntry(db: Database, id: string): void {
  const idx = db.fees.findIndex((f) => f.id === id);
  if (idx === -1) throw new HttpError(404, "Entry not found");
  db.fees.splice(idx, 1);
}

/**
 * Charge every learner in a class the term fee. Running it again for the same
 * class and term updates the amount instead of charging twice.
 */
export function setClassCharge(db: Database, actor: User, input: { classId?: unknown; term?: unknown; amount?: unknown; note?: unknown }): { learners: number } {
  const cls = db.classes.find((c) => c.id === input.classId);
  if (!cls) throw new HttpError(400, "Choose a class");
  const learners = db.users.filter((u) => u.role === "student" && u.classIds.includes(cls.id));
  if (learners.length === 0) throw new HttpError(400, `${cls.name} has no learners yet`);
  const entries = learners.map((l) => validEntry(db, actor, { ...input, studentId: l.id, kind: "charge" }, "class-charge"));
  const term = entries[0].term;
  db.fees = db.fees.filter((f) => !(f.source === "class-charge" && f.term === term && learners.some((l) => l.id === f.studentId)));
  db.fees.push(...entries);
  return { learners: learners.length };
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z]/g, "");
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export interface FeesImportReport {
  rows: { line: number; student: string; className: string; error: string | null }[];
  updated: number;
  errors: number;
}

/**
 * Import totals from a fees spreadsheet: Student name, Class, Term, Fees
 * (charged) and Paid. Each row replaces that learner's imported totals for
 * the term, so re-uploading the latest sheet is safe. Payments recorded by
 * hand in SchoolSync are kept separately.
 */
/** An optional Date column: 2026-02-14, 14/02/2026 (day first, as in Kenya) or an Excel date. Blank means today. */
export function importDate(raw: string): string | undefined {
  if (!raw) return undefined;
  // Excel keeps dates as day numbers counted from 30 Dec 1899 (e.g. 46067 = 14 Feb 2026).
  if (/^\d{5}(\.\d+)?$/.test(raw) && Number(raw) > 20000 && Number(raw) < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(raw)) * 86_400_000).toISOString().slice(0, 10);
  }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  const ymd = m ? [m[1], m[2], m[3]] : (m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(raw)) ? [m[3], m[2], m[1]] : null;
  if (ymd) {
    const iso = `${ymd[0]}-${ymd[1].padStart(2, "0")}-${ymd[2].padStart(2, "0")}`;
    const t = Date.parse(`${iso}T00:00:00Z`);
    if (!Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === iso) return iso;
  }
  throw new HttpError(400, `"${raw}" isn't a date (use 2026-02-14 or 14/02/2026)`);
}

export function importFees(db: Database, actor: User, csv: string): FeesImportReport {
  const table = parseCsv(csv);
  if (table.length < 2) throw new HttpError(400, "The file has no rows below the headings");
  const h = table[0].map(norm);
  const col = (names: string[]) => h.findIndex((x) => names.includes(x));
  const c = {
    student: col(["studentname", "student", "name", "learner", "learnername"]),
    cls: col(["class", "classname", "grade", "stream"]),
    term: col(["term"]),
    charged: col(["fees", "charged", "feescharged", "amountdue", "totalfees", "fee", "billed"]),
    paid: col(["paid", "amountpaid", "totalpaid", "payments"]),
    date: col(["date", "datepaid", "paymentdate", "paidon"]),
  };
  if (c.student < 0 || c.cls < 0 || c.term < 0 || (c.charged < 0 && c.paid < 0)) {
    throw new HttpError(400, 'The first row needs "Student name", "Class", "Term", and "Fees" and/or "Paid" columns');
  }
  const report: FeesImportReport = { rows: [], updated: 0, errors: 0 };
  table.slice(1).forEach((r, i) => {
    const cell = (k: keyof typeof c) => (c[k] >= 0 ? (r[c[k]] ?? "").trim() : "");
    const row = { line: i + 2, student: cell("student"), className: cell("cls"), error: null as string | null };
    report.rows.push(row);
    try {
      const cls = db.classes.find((x) => same(x.name, row.className));
      if (!cls) throw new HttpError(400, `No class called "${row.className}"`);
      const student = db.users.find((u) => u.role === "student" && same(u.name, row.student) && u.classIds.includes(cls.id));
      if (!student) throw new HttpError(400, `No learner called "${row.student}" in ${cls.name}`);
      const term = cell("term");
      if (!term) throw new HttpError(400, "Term is missing");
      const date = importDate(cell("date"));
      const fresh: FeeEntry[] = [];
      for (const kind of ["charged", "paid"] as const) {
        const raw = cell(kind);
        if (!raw) continue;
        const amount = parseAmount(raw);
        if (amount === null) throw new HttpError(400, `"${raw}" isn't an amount`);
        if (amount > 0) fresh.push(validEntry(db, actor, { studentId: student.id, kind: kind === "charged" ? "charge" : "payment", amount, term, date }, "import"));
      }
      db.fees = db.fees.filter((f) => !(f.source === "import" && f.studentId === student.id && f.term === term)).concat(fresh);
      report.updated++;
    } catch (err) {
      row.error = err instanceof HttpError ? err.message : "Unexpected error";
      report.errors++;
    }
  });
  return report;
}

export interface SchoolFees {
  charged: number;
  paid: number;
  outstanding: number;
  /** Payments dated on or after `since`. */
  collectedSince: number;
  paymentsSince: number;
  byClass: { className: string; outstanding: number; learnersOwing: number }[];
  topBalances: { name: string; className: string; balance: number }[];
}

export function schoolFees(db: Database, since: string): SchoolFees {
  const students = db.users.filter((u) => u.role === "student");
  const classOf = (id: string) => db.classes.find((c) => db.users.find((u) => u.id === id)?.classIds.includes(c.id))?.name ?? "No class";
  const balances = students.map((s) => ({ name: s.name, className: classOf(s.id), balance: feeStatement(db, s.id).balance }));
  const byClass = new Map<string, { className: string; outstanding: number; learnersOwing: number }>();
  for (const b of balances) {
    if (b.balance <= 0) continue;
    const c = byClass.get(b.className) ?? { className: b.className, outstanding: 0, learnersOwing: 0 };
    c.outstanding += b.balance;
    c.learnersOwing++;
    byClass.set(b.className, c);
  }
  const sinceDay = since.slice(0, 10);
  const recent = db.fees.filter((f) => f.kind === "payment" && f.date >= sinceDay);
  const charged = db.fees.filter((f) => f.kind === "charge").reduce((s, f) => s + f.amount, 0);
  const paid = db.fees.filter((f) => f.kind === "payment").reduce((s, f) => s + f.amount, 0);
  return {
    charged,
    paid,
    outstanding: balances.filter((b) => b.balance > 0).reduce((s, b) => s + b.balance, 0),
    collectedSince: recent.reduce((s, f) => s + f.amount, 0),
    paymentsSince: recent.length,
    byClass: [...byClass.values()].sort((a, b) => b.outstanding - a.outstanding),
    topBalances: balances.filter((b) => b.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 5),
  };
}
