import assert from "node:assert/strict";
import { test } from "node:test";
import { factsKey, insightFacts, insightScope, insightsFresh, INSIGHTS_MAX_AGE_MS } from "../src/lib/insights.ts";
import { migrateDatabase } from "../src/lib/migrate.ts";
import { seedDatabase, withDemoHistory } from "../src/lib/seed.ts";
import type { Database } from "../src/lib/types.ts";

const now = new Date("2026-10-23T09:00:00Z");

test("each role's insights cover only what its dashboard shows", () => {
  assert.equal(insightScope("admin"), "all");
  assert.equal(insightScope("director"), "all");
  assert.equal(insightScope("headteacher"), "performance");
  assert.equal(insightScope("secretary"), "money");
  for (const r of ["teacher", "parent", "student"] as const) assert.equal(insightScope(r), null);

  const db = withDemoHistory(seedDatabase());
  const all = insightFacts(db, "all", now);
  const perf = insightFacts(db, "performance", now);
  const money = insightFacts(db, "money", now);
  assert.match(all, /School performance/);
  assert.match(all, /Fees overall/);
  assert.match(perf, /Term 1 2026 End-term: 30%/);
  assert.match(perf, /Grade 7 East: 80% meeting or exceeding/);
  assert.doesNotMatch(perf, /Ksh/, "the headteacher's insights don't talk money");
  assert.match(money, /Ksh/);
  assert.doesNotMatch(money, /meeting or exceeding/, "the secretary's insights don't talk results");
});

test("no learner or parent names are sent to the AI", () => {
  const db = withDemoHistory(seedDatabase());
  const facts = insightFacts(db, "all", now);
  for (const u of db.users) assert.ok(!facts.includes(u.name), `${u.name} must not appear`);
});

test("nothing to read until there are results or fees", () => {
  const db = seedDatabase();
  db.results = [];
  db.fees = [];
  assert.equal(insightFacts(db, "all", now), "");
});

test("saved insights are reused until the figures change or a day passes", () => {
  const db = withDemoHistory(seedDatabase());
  const facts = insightFacts(db, "all", now);
  const saved = { goingWell: ["a"], needsAttention: [], nextSteps: [], factsKey: factsKey(facts), generatedAt: now.toISOString() };
  assert.equal(insightsFresh(saved, facts, now.getTime() + 60_000), true);
  assert.equal(insightsFresh(saved, facts, now.getTime() + INSIGHTS_MAX_AGE_MS + 1), false, "older than a day");
  db.fees.push({ ...db.fees[1], id: "f-new", amount: 5000, date: "2026-10-22", reference: "QX1" });
  assert.equal(insightsFresh(saved, insightFacts(db, "all", now), now.getTime() + 60_000), false, "a new payment changes the figures");
  assert.equal(insightsFresh(undefined, facts), false);
});

test("older data gets an empty insights store", () => {
  const db = seedDatabase() as Partial<Database>;
  delete db.insights;
  assert.equal(migrateDatabase(db as Database, {}), true);
  assert.deepEqual(db.insights, {});
});
