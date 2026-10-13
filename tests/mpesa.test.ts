import assert from "node:assert/strict";
import { test } from "node:test";
import { callbackUrls, darajaConfigured, mpesaReceiving, validCallbackToken } from "../src/lib/daraja.ts";
import { feeStatement } from "../src/lib/fees.ts";
import { routeMessage } from "../src/lib/hub.ts";
import { runImport } from "../src/lib/importer.ts";
import { assignMpesaPayment, ignoreMpesaPayment, matchLearner, parseConfirmation, parseTransTime, paymentTerm, receiptText, recordMpesaPayment } from "../src/lib/mpesa.ts";
import { seedDatabase } from "../src/lib/seed.ts";
import type { Database } from "../src/lib/types.ts";
import { createPerson, updatePerson } from "../src/lib/users.ts";

const u = (db: Database, id: string) => db.users.find((x) => x.id === id)!;
const confirmation = (over: Record<string, unknown> = {}) =>
  parseConfirmation({
    TransactionType: "Pay Bill",
    TransID: "QJK3ABC123",
    TransTime: "20261013142530",
    TransAmount: "5000.00",
    BusinessShortCode: "247247",
    BillRefNumber: "1001",
    MSISDN: "2547 ***** 126",
    FirstName: "JAMES",
    MiddleName: "",
    LastName: "KAMAU",
    ...over,
  });

test("Safaricom's confirmation is read safely", () => {
  const c = confirmation();
  assert.deepEqual([c.transId, c.amount, c.account, c.payerName, c.shortCode], ["QJK3ABC123", 5000, "1001", "JAMES KAMAU", "247247"]);
  assert.equal(c.paidAt, "2026-10-13T11:25:30.000Z", "TransTime is Nairobi time");
  assert.equal(parseTransTime("garbage", new Date("2026-01-01T00:00:00Z")), "2026-01-01T00:00:00.000Z");
  assert.throws(() => confirmation({ TransID: "" }), /TransID/);
  assert.throws(() => confirmation({ TransID: "<script>" }), /TransID/);
  assert.throws(() => confirmation({ TransAmount: "0" }), /TransAmount/);
});

test("payments find the learner by admission number, name, or the parent's real phone", () => {
  const db = seedDatabase();
  const brian = u(db, "u-student1");
  for (const account of ["1001", " adm 1001", "ADM/1001", "adm-no 1001"]) assert.equal(matchLearner(db, account, "")?.student.id, brian.id, account);
  assert.equal(matchLearner(db, "1001", "")?.by, "admission");
  for (const account of ["Brian Kamau", "BRIANKAMAU-G7E", "kamau brian"]) {
    const m = matchLearner(db, account, "");
    assert.deepEqual([m?.student.id, m?.by], [brian.id, "name"], account);
  }
  assert.equal(matchLearner(db, "9999", ""), null);
  assert.equal(matchLearner(db, "school fees", ""), null);
  // A plain number of a parent with one child works; masked or hashed numbers never match.
  assert.equal(matchLearner(db, "", "254700000004")?.by, "phone");
  assert.equal(matchLearner(db, "", "2547 ***** 004"), null);
  assert.equal(matchLearner(db, "", "a3f2700000004b9c0e1d2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c"), null);
  // Two learners with the same name: leave it to the bursar.
  createPerson(db, { name: "Brian Kamau", role: "student", classIds: ["c-grade8"] }, () => "u-twin", "dry-run");
  assert.equal(matchLearner(db, "Brian Kamau", ""), null);
  assert.equal(matchLearner(db, "1001", "")?.student.id, brian.id, "the admission number still decides");
});

test("a matched payment goes into the oldest unpaid term, once", () => {
  const db = seedDatabase();
  const before = feeStatement(db, "u-student1").balance;
  const out = recordMpesaPayment(db, confirmation());
  assert.equal(out.kind, "recorded");
  if (out.kind !== "recorded") return;
  assert.equal(out.entry.source, "mpesa");
  assert.equal(out.entry.reference, "QJK3ABC123");
  assert.equal(out.entry.date, "2026-10-13");
  assert.equal(out.entry.term, paymentTerm({ fees: db.fees.filter((f) => f.id !== out.entry.id) }, "u-student1", out.payment.paidAt));
  assert.equal(feeStatement(db, "u-student1").balance, before - 5000);
  assert.match(receiptText(db, u(db, "u-student1"), out.payment, "Sunrise Academy"), /Brian Kamau: Ksh 5,000[\s\S]*QJK3ABC123[\s\S]*(Balance now|fully paid|Credit)/);
  // Safaricom retries: nothing is recorded twice.
  assert.equal(recordMpesaPayment(db, confirmation()).kind, "duplicate");
  assert.equal(db.fees.filter((f) => f.reference === "QJK3ABC123").length, 1);
  assert.equal(db.mpesaPayments.length, 1);
});

test("a receipt the bursar already typed in isn't counted again", () => {
  const db = seedDatabase();
  db.fees.push({ ...db.fees.find((f) => f.kind === "payment")!, id: "f-manual", reference: "qjk3abc123" });
  const out = recordMpesaPayment(db, confirmation());
  assert.equal(out.kind, "duplicate");
  assert.equal(out.payment.feeEntryId, "f-manual");
  assert.equal(db.fees.filter((f) => f.reference?.toUpperCase() === "QJK3ABC123").length, 1);
});

test("unmatched payments wait for the bursar, who can record or dismiss them", () => {
  const db = seedDatabase();
  const out = recordMpesaPayment(db, confirmation({ TransID: "QJK3XYZ999", BillRefNumber: "fees" }));
  assert.equal(out.kind, "unmatched");
  assert.equal(db.fees.some((f) => f.reference === "QJK3XYZ999"), false);
  const admin = u(db, "u-admin");
  assert.throws(() => assignMpesaPayment(db, admin, out.payment.id, "u-parent1"), /Choose the learner/);
  const { entry } = assignMpesaPayment(db, admin, out.payment.id, "u-student2");
  assert.deepEqual([entry.studentId, entry.createdBy, out.payment.matchedBy, out.payment.status], ["u-student2", "u-admin", "manual", "recorded"]);
  assert.throws(() => assignMpesaPayment(db, admin, out.payment.id, "u-student2"), /already recorded/);
  assert.throws(() => ignoreMpesaPayment(db, out.payment.id), /already recorded/);
  const other = recordMpesaPayment(db, confirmation({ TransID: "QJK3NOTFEE", BillRefNumber: "" }));
  assert.equal(ignoreMpesaPayment(db, other.payment.id).status, "ignored");
});

test("admission numbers are unique, learners only, and come in with the class list", () => {
  const db = seedDatabase();
  assert.throws(() => updatePerson(db, "u-student2", { admissionNo: " 10-01 " }), /already belongs to Brian Kamau/);
  assert.throws(() => updatePerson(db, "u-student2", { admissionNo: "<b>" }), /letters, numbers/);
  assert.throws(() => updatePerson(db, "u-parent1", { admissionNo: "55" }), /Only learners/);
  assert.equal(updatePerson(db, "u-student2", { admissionNo: " adm/2001 " }).admissionNo, "ADM/2001");
  assert.equal(updatePerson(db, "u-student2", { admissionNo: "" }).admissionNo, null);

  const opts = { newId: (p: string) => `${p}-${crypto.randomUUID().slice(0, 6)}`, credentials: () => "dry-run" as const };
  const csv = ["Student name,Adm No,Class", "Faith Njeri,1002,Grade 8 West", "Peter Mwangi,1005,Grade 8 West", "Brian Kamau,1002,Grade 7 East", "Mary Wanjiku,1001,Grade 8 West", "Brian Kamau,2000,Grade 7 East"].join("\n");
  const fresh = seedDatabase();
  delete u(fresh, "u-student2").admissionNo;
  const report = runImport(fresh, csv, opts);
  assert.deepEqual(report.rows.map((r) => r.error ?? r.actions.join("; ")), [
    "Admission number 1002 added",
    "New student",
    "Admission number 1002 belongs to Faith Njeri",
    "Admission number 1001 belongs to Brian Kamau",
    "Brian Kamau already has admission number 1001",
  ]);
  assert.equal(fresh.users.find((x) => x.name === "Peter Mwangi")?.admissionNo, "1005");
  assert.equal(u(fresh, "u-student2").admissionNo, "1002");
});

test("an admission number added by a row that then fails is undone", () => {
  const db = seedDatabase();
  delete u(db, "u-student2").admissionNo;
  const opts = { newId: (p: string) => `${p}-${crypto.randomUUID().slice(0, 6)}`, credentials: () => "dry-run" as const };
  const report = runImport(db, "Student name,Admission number,Class,Parent name\nFaith Njeri,1002,Grade 8 West,No Contact", opts);
  assert.match(report.rows[0].error ?? "", /phone number or email/);
  assert.equal(u(db, "u-student2").admissionNo, undefined);
});

test("parents who owe are told how to pay on WhatsApp", () => {
  const db = seedDatabase();
  process.env.MPESA_SHORTCODE = "247247";
  try {
    const action = routeMessage(db, u(db, "u-parent1"), "2");
    assert.equal(action.type, "reply");
    assert.match((action as { text: string }).text, /Paybill 247247, Account 1001/);
  } finally {
    delete process.env.MPESA_SHORTCODE;
  }
});

test("Safaricom's address carries a secret and avoids words Daraja rejects", () => {
  const env = { MPESA_SHORTCODE: "247247", MPESA_CALLBACK_TOKEN: "abcdef0123456789abcdef" };
  assert.equal(mpesaReceiving(env), true);
  assert.equal(darajaConfigured(env), false, "needs the consumer key and secret too");
  assert.equal(mpesaReceiving({ ...env, MPESA_CALLBACK_TOKEN: "short" }), false);
  const urls = callbackUrls("https://school.onrender.com/", env);
  assert.equal(urls.confirmation, "https://school.onrender.com/api/payments/c2b/abcdef0123456789abcdef/confirm");
  assert.doesNotMatch(urls.confirmation + urls.validation, /mpesa|safaricom|m-pesa|exec|cmd|sql|query/i);
  assert.equal(validCallbackToken("abcdef0123456789abcdef", env), true);
  assert.equal(validCallbackToken("abcdef0123456789abcdeX", env), false);
  assert.equal(validCallbackToken("", { MPESA_CALLBACK_TOKEN: "" }), false);
});
