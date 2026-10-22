import assert from "node:assert/strict";
import { test } from "node:test";
import { classLevels, feesByClass, monthlyCollections, performanceTrend } from "../src/lib/charts.ts";
import { seedDatabase, withDemoHistory } from "../src/lib/seed.ts";

test("fees collected per month, ending this month", () => {
  const db = seedDatabase();
  db.fees.push({ ...db.fees[1], id: "x1", date: "2026-03-15", amount: 2500 }, { ...db.fees[1], id: "x2", date: "2025-03-15", amount: 999 });
  const months = monthlyCollections(db, 12, new Date("2026-10-22T09:00:00Z"));
  assert.equal(months.length, 12);
  assert.equal(months[0].month, "2025-11");
  assert.equal(months[11].month, "2026-10");
  assert.equal(months[0].label, "Nov 25", "the first month and January carry the year");
  assert.equal(months.find((m) => m.month === "2026-03")!.amount, 2500);
  assert.equal(months.reduce((s, m) => s + m.amount, 0), 25000 + 2500, "a payment older than 12 months is left out");
  assert.equal(monthlyCollections(db, 3, new Date("2026-01-10T00:00:00Z")).map((m) => m.month).join(), "2025-11,2025-12,2026-01");
});

test("fees by class: paid and still owed", () => {
  const db = seedDatabase();
  const rows = feesByClass(db);
  assert.deepEqual(rows.map((r) => [r.className, r.paid, r.outstanding]), [["Grade 7 East", 10000, 5000], ["Grade 8 West", 15000, 0]]);
});

test("school performance trend and class levels", () => {
  const db = withDemoHistory(seedDatabase());
  const trend = performanceTrend(db);
  assert.deepEqual(trend.map((t) => t.exam), ["Term 1 2026 End-term", "Term 2 2026 End-term", "Term 3 2026 Mid-term"], "oldest first");
  assert.deepEqual(trend.map((t) => t.meeting), [30, 60, 70]);
  const { exam, classes } = classLevels(db);
  assert.equal(exam, "Term 3 2026 Mid-term");
  assert.deepEqual(classes.find((c) => c.className === "Grade 7 East")!.counts, { EE: 1, ME: 3, AE: 1, BE: 0 });
  assert.deepEqual(classLevels({ ...db, results: [] }), { exam: null, classes: [] });
});

test("fee uploads can carry the payment date, so the monthly chart is right", async () => {
  const { importDate, importFees } = await import("../src/lib/fees.ts");
  assert.equal(importDate(""), undefined);
  assert.equal(importDate("2026-02-14"), "2026-02-14");
  assert.equal(importDate("14/02/2026"), "2026-02-14");
  assert.equal(importDate("4.6.2026"), "2026-06-04");
  assert.throws(() => importDate("31/02/2026"), /isn't a date/);
  assert.throws(() => importDate("Feb 14"), /isn't a date/);
  const db = seedDatabase();
  const admin = db.users.find((u) => u.role === "admin")!;
  const r = importFees(db, admin, "Student name,Class,Term,Fees,Paid,Date\nBrian Kamau,Grade 7 East,Term 1 2026,35000,30000,15/02/2026\nFaith Njeri,Grade 8 West,Term 1 2026,35000,35000,31/02/2026\n");
  assert.equal(r.updated, 1);
  assert.match(r.rows[1].error!, /isn't a date/);
  const t1 = db.fees.filter((f) => f.term === "Term 1 2026");
  assert.deepEqual(t1.map((f) => [f.kind, f.amount, f.date]), [["charge", 35000, "2026-02-15"], ["payment", 30000, "2026-02-15"]]);
  assert.equal(monthlyCollections(db, 12, new Date("2026-10-22T09:00:00Z")).find((m) => m.month === "2026-02")!.amount, 30000);
});
