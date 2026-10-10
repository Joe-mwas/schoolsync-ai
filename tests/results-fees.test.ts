import assert from "node:assert/strict";
import { test } from "node:test";
import { levelScore, normalizeLevel } from "../src/lib/cbc.ts";
import { HttpError } from "../src/lib/errors.ts";
import { addFeeEntry, feeStatement, formatFeeStatement, formatMoney, importFees, parseAmount, schoolFees, setClassCharge } from "../src/lib/fees.ts";
import { examPerformance, examsFor, formatReport, importResults, saveResults, studentReport } from "../src/lib/results.ts";
import { seedDatabase } from "../src/lib/seed.ts";

const user = (db: ReturnType<typeof seedDatabase>, id: string) => db.users.find((u) => u.id === id)!;
const rejects = (fn: () => unknown, status: number, re?: RegExp) =>
  assert.throws(fn, (e: unknown) => e instanceof HttpError && e.status === status && (!re || re.test(e.message)));

test("CBC levels are recognised in many spellings", () => {
  assert.equal(normalizeLevel("ee"), "EE");
  assert.equal(normalizeLevel(" M.E. "), "ME");
  assert.equal(normalizeLevel("ae2"), "AE2");
  assert.equal(normalizeLevel("Below Expectations"), "BE");
  assert.equal(normalizeLevel(""), null);
  assert.equal(normalizeLevel("A"), null);
  assert.equal(normalizeLevel("EE3"), null);
  assert.deepEqual(["EE1", "ME", "AE2", "BE"].map(levelScore), [4, 3, 2, 1]);
});

test("demo results read back for parents", () => {
  const db = seedDatabase();
  const r = studentReport(db, "u-student1")!;
  assert.equal(r.exam, "Term 3 2026 Mid-term");
  assert.equal(r.areas.length, 5);
  const text = formatReport("Brian Kamau", r);
  assert.match(text, /Mathematics: EE \(Exceeding Expectations\)/);
  assert.match(text, /Teacher's comment: Brian/);
  assert.equal(formatReport("X", null), "X: no results have been published yet.");
});

test("teachers save results for their own class only, replacing the exam", () => {
  const db = seedDatabase();
  const teacher = user(db, "u-teacher1"); // Grade 7 East
  saveResults(db, teacher, "c-grade7", "Term 3 2026 End-term", [
    { studentId: "u-student1", levels: { Mathematics: "ee", English: "ME", Art: "" }, comment: "Great term" },
  ]);
  assert.deepEqual(studentReport(db, "u-student1")!.areas, [
    { area: "English", level: "ME" },
    { area: "Mathematics", level: "EE" },
  ]);
  assert.equal(examsFor(db, ["u-student1"])[0], "Term 3 2026 End-term");
  // Saving again replaces rather than duplicates.
  saveResults(db, teacher, "c-grade7", "Term 3 2026 End-term", [{ studentId: "u-student1", levels: { Mathematics: "ME" } }]);
  assert.deepEqual(studentReport(db, "u-student1", "Term 3 2026 End-term")!.areas, [{ area: "Mathematics", level: "ME" }]);
  assert.equal(studentReport(db, "u-student1", "Term 3 2026 End-term")!.comment, null);

  rejects(() => saveResults(db, teacher, "c-grade8", "X", []), 403);
  rejects(() => saveResults(db, teacher, "c-grade7", "X", [{ studentId: "u-student2", levels: {} }]), 400, /isn't in this class/);
  rejects(() => saveResults(db, teacher, "c-grade7", "X", [{ studentId: "u-student1", levels: { Maths: "B+" } }]), 400, /CBC level/);
  rejects(() => saveResults(db, teacher, "c-grade7", "  ", []), 400, /name/);
});

test("results import: one column per learning area; bad rows skipped", () => {
  const db = seedDatabase();
  const csv = [
    "Learner name,Class,Mathematics,English,Kiswahili,Remarks",
    "Brian Kamau,Grade 7 East,EE,ME,AE,Keep it up",
    "Faith Njeri,Grade 8 West,me,ee,,Good work",
    "Nobody,Grade 7 East,EE,EE,EE,",
    "Brian Kamau,Grade 7 East,A,ME,ME,",
    "Faith Njeri,Grade 8 West,,,,",
  ].join("\n");
  const r = importResults(db, user(db, "u-director"), csv, "Term 3 2026 End-term");
  assert.deepEqual(r.areas, ["Mathematics", "English", "Kiswahili"]);
  assert.equal(r.errors, 2);
  assert.match(r.rows[2].error!, /No learner called "Nobody"/);
  assert.match(r.rows[3].error!, /"A" under Mathematics/);
  assert.equal(r.saved, 5);
  assert.equal(studentReport(db, "u-student2", "Term 3 2026 End-term")!.comment, "Good work", "blank row didn't wipe it");
  // A teacher can't import another class's results.
  const t = importResults(db, user(db, "u-teacher1"), csv, "Other");
  assert.match(t.rows[1].error!, /Not your class/);
});

test("class performance for the brief", () => {
  const db = seedDatabase();
  const perf = examPerformance(db, "Term 3 2026 Mid-term");
  const g8 = perf.find((p) => p.className === "Grade 8 West")!;
  assert.deepEqual(g8.counts, { EE: 1, ME: 2, AE: 1, BE: 1 });
  assert.equal(g8.weakestArea, "Integrated Science");
  assert.deepEqual(g8.needingSupport, []);
});

test("fee statements, amounts and formatting", () => {
  const db = seedDatabase();
  const st = feeStatement(db, "u-student1");
  assert.deepEqual([st.charged, st.paid, st.balance], [15000, 10000, 5000]);
  assert.equal(formatMoney(5000), "Ksh 5,000");
  assert.match(formatFeeStatement("Brian Kamau", st), /Balance due: Ksh 5,000[\s\S]*Last payment: Ksh 10,000 .* \(ref QK7H2LM9XA\)/);
  assert.match(formatFeeStatement("Faith Njeri", feeStatement(db, "u-student2")), /Fully paid ✅/);
  assert.deepEqual(["12,000", "Ksh 7500", "3000.00", "-5", "abc", 250].map(parseAmount), [12000, 7500, 3000, 5, null, 250]);
});

test("recording payments and class charges", () => {
  const db = seedDatabase();
  const bursar = user(db, "u-director");
  addFeeEntry(db, bursar, { studentId: "u-student1", kind: "payment", amount: "5,000", term: "Term 3 2026", reference: "QX99" });
  assert.equal(feeStatement(db, "u-student1").balance, 0);
  rejects(() => addFeeEntry(db, bursar, { studentId: "u-student1", kind: "payment", amount: 100, term: "T", reference: "qx99" }), 409, /already recorded/);
  rejects(() => addFeeEntry(db, bursar, { studentId: "u-student1", kind: "payment", amount: 0, term: "T" }), 400);
  rejects(() => addFeeEntry(db, bursar, { studentId: "u-teacher1", kind: "payment", amount: 10, term: "T" }), 400, /learner/);

  setClassCharge(db, bursar, { classId: "c-grade7", term: "Term 1 2027", amount: 16000 });
  setClassCharge(db, bursar, { classId: "c-grade7", term: "Term 1 2027", amount: 17000 });
  const term1 = feeStatement(db, "u-student1").terms.find((t) => t.term === "Term 1 2027")!;
  assert.equal(term1.charged, 17000, "re-running updates instead of charging twice");
});

test("fees import replaces imported totals and keeps manual payments", () => {
  const db = seedDatabase();
  const bursar = user(db, "u-director");
  const csv = "Student name,Class,Term,Fees,Paid\nBrian Kamau,Grade 7 East,Term 1 2027,16000,6000\nNobody,Grade 7 East,Term 1 2027,1,1\n";
  let r = importFees(db, bursar, csv);
  assert.deepEqual([r.updated, r.errors], [1, 1]);
  r = importFees(db, bursar, "Student name,Class,Term,Fees,Paid\nBrian Kamau,Grade 7 East,Term 1 2027,16000,9000\n");
  const t = feeStatement(db, "u-student1").terms.find((x) => x.term === "Term 1 2027")!;
  assert.deepEqual([t.charged, t.paid], [16000, 9000]);
  assert.equal(feeStatement(db, "u-student1").terms.find((x) => x.term === "Term 3 2026")!.paid, 10000, "manual payments untouched");
  rejects(() => importFees(db, bursar, "Name,Class\nx,y"), 400, /Term/);
});

test("school fee summary for the brief", () => {
  const db = seedDatabase();
  const s = schoolFees(db, "2000-01-01");
  assert.deepEqual([s.charged, s.paid, s.outstanding], [30000, 25000, 5000]);
  assert.deepEqual(s.byClass, [{ className: "Grade 7 East", outstanding: 5000, learnersOwing: 1 }]);
  assert.equal(s.topBalances[0].name, "Brian Kamau");
  assert.equal(schoolFees(db, "2999-01-01").collectedSince, 0);
});
