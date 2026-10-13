import { HttpError } from "./errors.ts";
import { feeStatement, formatMoney, parseAmount } from "./fees.ts";
import { canonicalPhone, phoneKey } from "./phone.ts";
import type { Database, FeeEntry, MpesaMatch, MpesaPayment, User } from "./types.ts";
import { admissionKey } from "./users.ts";

/**
 * M-Pesa Paybill payments (Safaricom Daraja C2B). Safaricom posts each
 * payment to our confirmation URL; we find the learner from the account
 * number the parent typed and record it in the fees ledger.
 */

/** The fields we use from Safaricom's C2B confirmation. */
export interface C2BConfirmation {
  transId: string;
  amount: number;
  account: string;
  payerName: string;
  phone: string;
  shortCode: string;
  paidAt: string;
}

/** "20261013142530" (Nairobi time) → ISO timestamp. */
export function parseTransTime(raw: unknown, fallback = new Date()): string {
  const m = typeof raw === "string" ? raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/) : null;
  if (!m) return fallback.toISOString();
  const [, y, mo, d, h, mi, s] = m;
  const t = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}+03:00`);
  return Number.isNaN(t) ? fallback.toISOString() : new Date(t).toISOString();
}

export function parseConfirmation(body: unknown): C2BConfirmation {
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
  const transId = str(b.TransID).toUpperCase();
  if (!/^[A-Z0-9]{6,20}$/.test(transId)) throw new HttpError(400, "Missing or invalid TransID");
  const amount = parseAmount(str(b.TransAmount));
  if (!amount) throw new HttpError(400, "Missing or invalid TransAmount");
  const payerName = [b.FirstName, b.MiddleName, b.LastName].map(str).filter(Boolean).join(" ");
  return {
    transId,
    amount,
    account: str(b.BillRefNumber).slice(0, 40),
    payerName: payerName.slice(0, 80),
    phone: str(b.MSISDN).slice(0, 80),
    shortCode: str(b.BusinessShortCode),
    paidAt: parseTransTime(b.TransTime),
  };
}

const nameKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const words = (s: string) => s.toLowerCase().match(/[a-z]{2,}/g) ?? [];

/**
 * Who a payment is for, from what the parent typed as the account number:
 * the admission number ("1001", "ADM 1001"), else the learner's name
 * ("Brian Kamau", "BrianKamau-G7E", "Kamau Brian"), else, when Safaricom
 * shows the payer's number, the only child of the parent with that number.
 * Anything ambiguous is left for the bursar.
 */
export function matchLearner(db: Pick<Database, "users">, account: string, phone: string): { student: User; by: MpesaMatch } | null {
  const students = db.users.filter((u) => u.role === "student");

  const acct = admissionKey(account);
  if (acct) {
    const byAdmission = (key: string) => students.filter((u) => u.admissionNo && admissionKey(u.admissionNo) === key);
    let hits = byAdmission(acct);
    if (hits.length === 0) hits = byAdmission(acct.replace(/^(ADMNO|ADM|NO)/, ""));
    if (hits.length === 0 && /^\d+$/.test(acct)) hits = students.filter((u) => u.admissionNo && admissionKey(u.admissionNo).replace(/^[A-Z]+/, "") === acct);
    if (hits.length === 1) return { student: hits[0], by: "admission" };
    if (hits.length > 1) return null;
  }

  const key = nameKey(account);
  if (key.length >= 4) {
    // The longest learner name the account starts with (allows a class suffix like "-G7E").
    const prefixed = students.filter((u) => nameKey(u.name).length >= 4 && key.startsWith(nameKey(u.name)));
    const longest = Math.max(0, ...prefixed.map((u) => nameKey(u.name).length));
    const best = prefixed.filter((u) => nameKey(u.name).length === longest);
    if (best.length === 1) return { student: best[0], by: "name" };
    if (best.length > 1) return null;
    // The same words in any order ("Kamau Brian").
    const typed = words(account).sort().join(" ");
    const same = students.filter((u) => words(u.name).length >= 2 && words(u.name).sort().join(" ") === typed);
    if (same.length === 1) return { student: same[0], by: "name" };
    if (same.length > 1) return null;
  }

  // Safaricom usually masks or hashes the number; only a real number counts.
  const real = canonicalPhone(phone);
  const payer = real ? phoneKey(real) : "";
  if (payer) {
    const parent = db.users.find((u) => u.role === "parent" && u.phone && phoneKey(u.phone) === payer);
    const kids = parent ? students.filter((s) => parent.childIds.includes(s.id)) : [];
    if (kids.length === 1) return { student: kids[0], by: "phone" };
  }
  return null;
}

/** Which term a payment goes to: the oldest unpaid one, else the latest term used. */
export function paymentTerm(db: Pick<Database, "fees">, studentId: string, paidAt: string): string {
  const st = feeStatement(db, studentId);
  const owing = st.terms.find((t) => t.balance > 0);
  if (owing) return owing.term;
  if (st.terms.length) return st.terms[st.terms.length - 1].term;
  const latest = [...db.fees].sort((a, b) => b.date.localeCompare(a.date))[0];
  return latest?.term ?? `Payments ${paidAt.slice(0, 4)}`;
}

function recordEntry(db: Database, p: MpesaPayment, student: User, by: MpesaMatch, actorId: string | null): FeeEntry {
  const entry: FeeEntry = {
    id: `f-${crypto.randomUUID().slice(0, 8)}`,
    studentId: student.id,
    term: paymentTerm(db, student.id, p.paidAt),
    kind: "payment",
    amount: p.amount,
    date: new Date(Date.parse(p.paidAt) + 3 * 3600_000).toISOString().slice(0, 10),
    reference: p.transId,
    note: `M-Pesa${p.payerName ? ` from ${p.payerName}` : ""}${p.account ? ` (account ${p.account})` : ""}`.slice(0, 200),
    source: "mpesa",
    createdBy: actorId,
    createdAt: new Date().toISOString(),
  };
  db.fees.push(entry);
  Object.assign(p, { status: "recorded", studentId: student.id, feeEntryId: entry.id, matchedBy: by });
  return entry;
}

export type RecordOutcome =
  | { kind: "recorded"; payment: MpesaPayment; student: User; entry: FeeEntry }
  | { kind: "unmatched"; payment: MpesaPayment }
  | { kind: "duplicate"; payment: MpesaPayment };

/**
 * Store a confirmed payment and, when the learner is clear, record it in
 * their fees. Safaricom may send the same payment twice; that is a no-op.
 */
export function recordMpesaPayment(db: Database, c: C2BConfirmation, opts: { test?: boolean } = {}): RecordOutcome {
  const existing = db.mpesaPayments.find((p) => p.transId === c.transId);
  if (existing) return { kind: "duplicate", payment: existing };

  const payment: MpesaPayment = {
    id: `mp-${crypto.randomUUID().slice(0, 8)}`,
    transId: c.transId,
    amount: c.amount,
    account: c.account,
    payerName: c.payerName,
    phone: c.phone,
    paidAt: c.paidAt,
    receivedAt: new Date().toISOString(),
    status: "unmatched",
    studentId: null,
    feeEntryId: null,
    matchedBy: null,
    ...(opts.test ? { test: true } : {}),
  };
  db.mpesaPayments.push(payment);

  // The bursar may already have typed this receipt in by hand.
  const manual = db.fees.find((f) => f.kind === "payment" && f.reference?.toUpperCase() === c.transId);
  if (manual) {
    Object.assign(payment, { status: "recorded", studentId: manual.studentId, feeEntryId: manual.id, matchedBy: "manual" });
    return { kind: "duplicate", payment };
  }

  const match = matchLearner(db, c.account, c.phone);
  if (!match) return { kind: "unmatched", payment };
  const entry = recordEntry(db, payment, match.student, match.by, null);
  return { kind: "recorded", payment, student: match.student, entry };
}

/** The bursar links an unmatched payment to a learner. */
export function assignMpesaPayment(db: Database, actor: User, paymentId: string, studentId: unknown): { payment: MpesaPayment; student: User; entry: FeeEntry } {
  const payment = db.mpesaPayments.find((p) => p.id === paymentId);
  if (!payment) throw new HttpError(404, "Payment not found");
  if (payment.status === "recorded") throw new HttpError(409, "This payment is already recorded");
  const student = db.users.find((u) => u.id === studentId && u.role === "student");
  if (!student) throw new HttpError(400, "Choose the learner this payment is for");
  const entry = recordEntry(db, payment, student, "manual", actor.id);
  return { payment, student, entry };
}

/** Not a school-fees payment (e.g. sent by mistake): keep it out of the queue. */
export function ignoreMpesaPayment(db: Database, paymentId: string): MpesaPayment {
  const payment = db.mpesaPayments.find((p) => p.id === paymentId);
  if (!payment) throw new HttpError(404, "Payment not found");
  if (payment.status === "recorded") throw new HttpError(409, "This payment is already recorded; delete it from the learner's statement instead");
  payment.status = "ignored";
  return payment;
}

/** The WhatsApp receipt sent to the learner's parents. */
export function receiptText(db: Pick<Database, "fees">, student: User, payment: MpesaPayment, schoolName: string): string {
  const st = feeStatement(db, student.id);
  const when = new Date(payment.paidAt).toLocaleString("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const balance =
    st.balance > 0 ? `Balance now: ${formatMoney(st.balance)}` : st.balance < 0 ? `Credit (overpaid): ${formatMoney(-st.balance)}` : "Fees fully paid ✅";
  return [
    `✅ Payment received, thank you!`,
    `${student.name}: ${formatMoney(payment.amount)}`,
    `M-Pesa ref ${payment.transId}, ${when}`,
    balance,
    `— ${schoolName}`,
  ].join("\n");
}

/** Shown to parents with their balance: how to pay so it's recorded automatically. */
export function payInstructions(student: Pick<User, "admissionNo">, env: Record<string, string | undefined> = process.env): string {
  const paybill = env.MPESA_SHORTCODE?.trim();
  if (!paybill || !student.admissionNo) return "";
  return `Pay via M-Pesa Paybill ${paybill}, Account ${student.admissionNo}`;
}
