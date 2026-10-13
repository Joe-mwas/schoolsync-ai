import { schoolName } from "./ai.ts";
import { mutateDb, readDb } from "./db.ts";
import { assignMpesaPayment, receiptText, recordMpesaPayment, type C2BConfirmation, type RecordOutcome } from "./mpesa.ts";
import { notifyPerson } from "./notify.ts";
import type { MpesaPayment, User } from "./types.ts";

/** WhatsApp the learner's parents a receipt with the new balance. */
export async function sendReceipts(studentId: string, paymentId: string): Promise<number> {
  const db = await readDb();
  const student = db.users.find((u) => u.id === studentId);
  const payment = db.mpesaPayments.find((p) => p.id === paymentId);
  if (!student || !payment) return 0;
  const text = receiptText(db, student, payment, schoolName());
  const parents = db.users.filter((u) => u.role === "parent" && u.phone && u.childIds.includes(student.id));
  for (const parent of parents) await notifyPerson(parent, "Fee payment received", text);
  return parents.length;
}

/** A payment confirmed by Safaricom (or the test form): record it, then send receipts. */
export async function handleMpesaPayment(c: C2BConfirmation, opts: { test?: boolean } = {}): Promise<RecordOutcome> {
  const outcome = await mutateDb((db) => recordMpesaPayment(db, c, opts));
  if (outcome.kind === "recorded") {
    // Answer Safaricom straight away; the receipt follows in the background.
    void sendReceipts(outcome.student.id, outcome.payment.id).catch((err) => console.error("M-Pesa receipt failed", err));
  } else if (outcome.kind === "unmatched") {
    console.warn(`M-Pesa payment ${c.transId} (account "${c.account}") needs matching on the Fees page`);
  }
  return outcome;
}

export async function assignAndNotify(actor: User, paymentId: string, studentId: unknown): Promise<MpesaPayment> {
  const { payment, student } = await mutateDb((db) => assignMpesaPayment(db, actor, paymentId, studentId));
  await sendReceipts(student.id, payment.id).catch((err) => console.error("M-Pesa receipt failed", err));
  return payment;
}
