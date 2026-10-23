import assert from "node:assert/strict";
import { test } from "node:test";
import { levelFromPercent } from "../src/lib/cbc.ts";
import { mainExams, performanceTrend } from "../src/lib/charts.ts";
import { HttpError } from "../src/lib/errors.ts";
import { examInfo, formatReport, importResults, inferType, learnerAssessments, parseCell, saveResults, studentReport } from "../src/lib/results.ts";
import { seedDatabase, withDemoHistory } from "../src/lib/seed.ts";

const user = (db: ReturnType<typeof seedDatabase>, id: string) => db.users.find((u) => u.id === id)!;

test("marks become CBC levels on KNEC's eight-level rubric", () => {
  assert.deepEqual([100, 90, 89, 75, 74, 58, 57, 41, 40, 31, 30, 21, 20, 11, 10, 0].map(levelFromPercent), [
    "EE1", "EE1", "EE2", "EE2", "ME1", "ME1", "ME2", "ME2", "AE1", "AE1", "AE2", "AE2", "BE1", "BE1", "BE2", "BE2",
  ]);
});

test("a cell takes a level, or marks when the assessment is marked out of a number", () => {
  assert.deepEqual(parseCell("ME", null), { level: "ME", score: null });
  assert.deepEqual(parseCell("ee2", 20), { level: "EE2", score: null });
  assert.deepEqual(parseCell("16", 20), { level: "EE2", score: 16 });
  assert.deepEqual(parseCell("8/10", 20), { level: "EE2", score: 16 }, "marks out of another total are scaled");
  assert.deepEqual(parseCell("45%", 20), { level: "ME2", score: 9 });
  assert.equal(parseCell("  ", 20), null);
  assert.throws(() => parseCell("21", 20), /more than the 20/);
  assert.throws(() => parseCell("16", null), /isn't a CBC level/);
  assert.throws(() => parseCell("B+", 20), /isn't marks out of 20/);
});

test("assessment types are guessed from older exam names", () => {
  assert.equal(inferType("Maths CAT 2"), "quiz");
  assert.equal(inferType("Weekly quiz"), "quiz");
  assert.equal(inferType("Term 1 2027 Opener"), "opener");
  assert.equal(inferType("Term 3 2026 Mid-term"), "midterm");
  assert.equal(inferType("Term 2 2026 End-term"), "endterm");
  assert.equal(inferType("End of term exam"), "endterm");
  assert.equal(inferType("Science fair"), "other");
});

test("saving a marked quiz stores marks and levels, and the exam's type", () => {
  const db = seedDatabase();
  const teacher = user(db, "u-teacher1");
  saveResults(db, teacher, "c-grade7", "Maths quiz 1", [{ studentId: "u-student1", levels: { Mathematics: "13" } }], { type: "quiz", outOf: 15 });
  const info = examInfo(db, "Maths quiz 1");
  assert.equal(info.type, "quiz");
  assert.equal(info.outOf, 15);
  const r = db.results.find((x) => x.exam === "Maths quiz 1")!;
  assert.equal(r.score, 13);
  assert.equal(r.level, "EE2", "87%");
  const report = studentReport(db, "u-student1", "Maths quiz 1")!;
  assert.match(formatReport("Brian Kamau", report), /Mathematics: 13\/15 · EE2/);
  assert.throws(
    () => saveResults(db, teacher, "c-grade7", "Maths quiz 1", [{ studentId: "u-student1", levels: { Mathematics: "19" } }]),
    (e: unknown) => e instanceof HttpError && e.status === 400 && /Brian Kamau \(Mathematics\): 19 is more than the 15/.test(e.message),
  );
  assert.throws(() => saveResults(db, teacher, "c-grade7", "Maths quiz 1", [], { outOf: "lots" }), /must be a number/);
});

test("results files can hold marks for a marked assessment", () => {
  const db = seedDatabase();
  saveResults(db, user(db, "u-teacher1"), "c-grade7", "Kiswahili CAT", [], { type: "quiz", outOf: 25 });
  const report = importResults(db, user(db, "u-director"), "Student name,Class,Kiswahili\nBrian Kamau,Grade 7 East,20\nFaith Njeri,Grade 8 West,30\n", "Kiswahili CAT");
  assert.equal(report.saved, 1);
  assert.match(report.rows[1].error ?? "", /isn't marks out of 25/);
  assert.equal(db.results.find((r) => r.exam === "Kiswahili CAT")?.score, 20);
});

test("a parent sees every assessment, newest first, with overall levels", () => {
  const db = withDemoHistory(seedDatabase());
  const list = learnerAssessments(db, "u-student1");
  assert.deepEqual(list.map((a) => a.exam), ["Term 3 2026 Mid-term", "Maths & Science CAT 2", "Term 2 2026 End-term", "Term 1 2026 End-term"]);
  const cat = list[1];
  assert.equal(cat.type, "quiz");
  assert.equal(cat.outOf, 20);
  assert.deepEqual(cat.areas.find((a) => a.area === "Mathematics"), { area: "Mathematics", level: "EE2", score: 16 });
  assert.equal(cat.overall.percent, 70, "(16 + 12) of 40");
  assert.equal(cat.overall.level, "ME1");
  assert.equal(list[2].type, "endterm");
  assert.equal(list[2].overall.percent, null);
});

test("the school's trend charts use the main exams, not small quizzes", () => {
  const db = withDemoHistory(seedDatabase());
  assert.ok(!mainExams(db).includes("Maths & Science CAT 2"));
  assert.ok(!performanceTrend(db).some((p) => p.exam === "Maths & Science CAT 2"));
});
