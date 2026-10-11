import assert from "node:assert/strict";
import { test } from "node:test";
import { createFact, deleteFact, factsFor, factsPrompt, MAX_FACTS, updateFact } from "../src/lib/facts.ts";
import { migrateDatabase } from "../src/lib/migrate.ts";
import { seedDatabase } from "../src/lib/seed.ts";
import type { Database } from "../src/lib/types.ts";

const fresh = () => seedDatabase();
const u = (db: Database, id: string) => db.users.find((x) => x.id === id)!;

test("facts are validated and cleaned", () => {
  const db = fresh();
  const admin = u(db, "u-admin");
  assert.throws(() => createFact(db, admin, { title: "  ", details: "x" }), /short title/);
  assert.throws(() => createFact(db, admin, { title: "Fees", details: "" }), /Write the fact/);
  assert.throws(() => createFact(db, admin, { title: "Fees", details: "x".repeat(2001) }), /under 2000/);
  const f = createFact(db, admin, { topic: "Nonsense", title: "  Lunch  ", details: " Ksh 3,500 per term ", visibleTo: "weird", fromAiLogId: "missing" });
  assert.deepEqual([f.topic, f.title, f.details, f.visibleTo, f.fromAiLogId, f.updatedBy], ["Other", "Lunch", "Ksh 3,500 per term", "everyone", null, "u-admin"]);
  const g = updateFact(db, admin, f.id, { topic: "Meals", title: "Lunch fee", details: "Ksh 4,000 per term", visibleTo: "staff" });
  assert.deepEqual([g.topic, g.title, g.details, g.visibleTo], ["Meals", "Lunch fee", "Ksh 4,000 per term", "staff"]);
  assert.throws(() => updateFact(db, admin, "nope", { title: "a", details: "b" }), /not found/);
});

test("the school can keep a bounded number of facts", () => {
  const db = fresh();
  while (db.facts.length < MAX_FACTS) db.facts.push({ ...db.facts[0], id: `f${db.facts.length}` });
  assert.throws(() => createFact(db, u(db, "u-admin"), { title: "One more", details: "x" }), /up to 300/);
});

test("a fact saved from AI Review closes that answer, and deleting it reopens the link", () => {
  const db = fresh();
  db.aiLogs.push({ id: "log1", channel: "whatsapp", userId: "u-parent1", question: "What is the paybill?", answer: "I am not sure", createdAt: new Date().toISOString(), flagged: true, note: "Paybill is 247247" });
  const f = createFact(db, u(db, "u-admin"), { topic: "Fees and payments", title: "Paybill", details: "247247", fromAiLogId: "log1" });
  const log = db.aiLogs[0];
  assert.equal(f.fromAiLogId, "log1");
  assert.equal(log.factId, f.id);
  assert.ok(log.reviewedAt);
  // Editing keeps the link even if the client sends something else.
  assert.equal(updateFact(db, u(db, "u-admin"), f.id, { title: "Paybill", details: "247247 acc ADM", fromAiLogId: null }).fromAiLogId, "log1");
  deleteFact(db, f.id);
  assert.equal(log.factId, null);
  assert.equal(db.facts.some((x) => x.id === f.id), false);
  assert.throws(() => deleteFact(db, f.id), /not found/);
});

test("staff-only facts never reach parents or learners", () => {
  const db = fresh();
  const staffOnly = (id: string) => factsFor(db, u(db, id)).some((f) => f.visibleTo === "staff");
  assert.equal(staffOnly("u-parent1"), false);
  assert.equal(staffOnly("u-student1"), false);
  assert.equal(staffOnly("u-teacher1"), true);
  assert.equal(staffOnly("u-director"), true);
  assert.equal(staffOnly("u-admin"), true);
  assert.doesNotMatch(factsPrompt(factsFor(db, u(db, "u-parent1"))), /Staff meeting/);
});

test("the AI sees facts grouped by topic in a stable order", () => {
  const db = fresh();
  db.facts = [];
  assert.equal(factsPrompt([]), "");
  const admin = u(db, "u-admin");
  createFact(db, admin, { topic: "Uniform", title: "Shoes", details: "Black" });
  createFact(db, admin, { topic: "Fees and payments", title: "Paybill", details: "247247" });
  createFact(db, admin, { topic: "Uniform", title: "Blazer", details: "Navy" });
  assert.equal(factsPrompt(db.facts), "## Fees and payments\n- Paybill: 247247\n## Uniform\n- Blazer: Navy\n- Shoes: Black");
});

test("older databases gain an empty facts list", () => {
  const db = fresh() as Partial<Database>;
  delete db.facts;
  assert.equal(migrateDatabase(db as Database, {}), true);
  assert.deepEqual(db.facts, []);
});
