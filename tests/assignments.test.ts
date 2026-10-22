import assert from "node:assert/strict";
import { test } from "node:test";
import { assignmentsContext, assignmentsFor, createAssignment, deleteAssignment, setAssignmentDone } from "../src/lib/assignments.ts";
import { buildSchoolContext } from "../src/lib/ai.ts";
import { migrateDatabase } from "../src/lib/migrate.ts";
import { seedDatabase } from "../src/lib/seed.ts";
import type { Database } from "../src/lib/types.ts";

const fresh = () => seedDatabase();
const u = (db: Database, id: string) => db.users.find((x) => x.id === id)!;
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

test("a teacher sets work only for their own classes", () => {
  const db = fresh();
  const t1 = u(db, "u-teacher1");
  const a = createAssignment(db, t1, { title: "Essay", subject: "English", classIds: ["c-grade7"], dueDate: inDays(2), details: "  300 words  " });
  assert.equal(a.kind, "assignment");
  assert.equal(a.details, "300 words");
  assert.throws(() => createAssignment(db, t1, { title: "X", subject: "English", classIds: ["c-grade8"], dueDate: inDays(2) }), /your own classes/);
  assert.throws(() => createAssignment(db, t1, { title: "X", subject: "English", classIds: ["c-grade7"] }), /due date/);
  assert.throws(() => createAssignment(db, t1, { title: "X", subject: "English", classIds: ["c-grade7"], dueDate: inDays(1), link: "javascript:alert(1)" }), /http/);
  const r = createAssignment(db, t1, { kind: "revision", title: "Revise", subject: "Maths", classIds: ["c-grade7"], dueDate: inDays(1) });
  assert.equal(r.dueDate, null, "revision has no due date");
  // The headteacher can set work for any class; nobody else outside teaching can.
  assert.ok(createAssignment(db, u(db, "u-headteacher"), { title: "Y", subject: "Kiswahili", classIds: ["c-grade8"], dueDate: inDays(3) }));
  for (const id of ["u-director", "u-secretary", "u-parent1", "u-student1"]) {
    assert.throws(() => createAssignment(db, u(db, id), { title: "Z", subject: "English", classIds: ["c-grade7"], dueDate: inDays(3) }), /Only teachers/);
  }
});

test("learners see their own class's work and tick it off", () => {
  const db = fresh();
  const brian = u(db, "u-student1"); // Grade 7
  const faith = u(db, "u-student2"); // Grade 8
  assert.ok(assignmentsFor(db, brian).some((a) => a.id === "as-demo-maths"));
  assert.equal(assignmentsFor(db, faith).length, 0, "another class's work stays hidden");
  assert.throws(() => setAssignmentDone(db, faith, "as-demo-maths", true), /not found/);
  setAssignmentDone(db, brian, "as-demo-maths", true);
  assert.deepEqual(db.assignments.find((a) => a.id === "as-demo-maths")!.doneBy, ["u-student1"]);
  setAssignmentDone(db, brian, "as-demo-maths", true);
  assert.equal(db.assignments.find((a) => a.id === "as-demo-maths")!.doneBy.length, 1, "ticking twice counts once");
  setAssignmentDone(db, brian, "as-demo-maths", false);
  assert.equal(db.assignments.find((a) => a.id === "as-demo-maths")!.doneBy.length, 0);
  assert.throws(() => setAssignmentDone(db, brian, "as-demo-revision", true), /Revision/);
  assert.throws(() => setAssignmentDone(db, u(db, "u-teacher1"), "as-demo-maths", true), /Only learners/);
  for (const id of ["u-director", "u-secretary", "u-parent1"]) assert.equal(assignmentsFor(db, u(db, id)).length, 0);
});

test("only whoever set it (or the headteacher / administrator) removes it", () => {
  const db = fresh();
  assert.throws(() => deleteAssignment(db, u(db, "u-teacher2"), "as-demo-maths"), /teacher who set it/);
  assert.throws(() => deleteAssignment(db, u(db, "u-student1"), "as-demo-maths"), /teacher who set it/);
  deleteAssignment(db, u(db, "u-headteacher"), "as-demo-maths");
  deleteAssignment(db, u(db, "u-teacher1"), "as-demo-revision");
  assert.equal(db.assignments.length, 0);
});

test("the learner's AI knows what's due and what to revise, not other classes' work", () => {
  const db = fresh();
  createAssignment(db, u(db, "u-teacher2"), { title: "Grade 8 map work", subject: "Social Studies", classIds: ["c-grade8"], dueDate: inDays(2) });
  const brian = u(db, "u-student1");
  const ctx = assignmentsContext(db, brian);
  assert.match(ctx, /Fractions worksheet/);
  assert.match(ctx, /Revision: Integrated Science/);
  assert.doesNotMatch(ctx, /map work/);
  setAssignmentDone(db, brian, "as-demo-maths", true);
  assert.doesNotMatch(assignmentsContext(db, brian), /Fractions/, "done work drops out");
  assert.match(buildSchoolContext(brian, db), /Integrated Science/);
  assert.doesNotMatch(buildSchoolContext(u(db, "u-parent2"), db), /Fractions/);
});

test("older data gets an empty assignments list", () => {
  const db = fresh() as Partial<Database>;
  delete db.assignments;
  assert.equal(migrateDatabase(db as Database, {}), true);
  assert.deepEqual(db.assignments, []);
});
