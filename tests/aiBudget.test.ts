import assert from "node:assert/strict";
import { test } from "node:test";
import { addUsage, budgetState, budgetView, callCost, monthKey } from "../src/lib/aiBudget.ts";
import { migrateDatabase } from "../src/lib/migrate.ts";
import { seedDatabase } from "../src/lib/seed.ts";
import type { Database } from "../src/lib/types.ts";

test("each call is priced by model, with cached input cheaper", () => {
  const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);
  close(callCost("claude-opus-5-5", { input_tokens: 1_000_000, output_tokens: 0 }), 4);
  close(callCost("claude-opus-5-5", { input_tokens: 0, output_tokens: 1_000_000 }), 20);
  close(callCost("claude-sonnet-5-5", { input_tokens: 1_000_000, output_tokens: 1_000_000 }), 12);
  close(callCost("claude-haiku-5-5", { input_tokens: 2000, output_tokens: 300 }), 0.00035);
  close(callCost("claude-opus-5-5", { cache_creation_input_tokens: 1_000_000 }), 5);
  close(callCost("claude-opus-5-5", { cache_read_input_tokens: 1_000_000 }), 0.4);
  close(callCost("some-new-model", { input_tokens: 1_000_000 }), 4);
});

test("months are counted in Nairobi time", () => {
  assert.equal(monthKey(new Date("2026-10-31T20:59:00Z")), "2026-10");
  assert.equal(monthKey(new Date("2026-10-31T21:00:00Z")), "2026-11", "midnight in Nairobi");
});

test("the AI warns at 80%, pauses at the limit, and starts again next month", () => {
  const db = seedDatabase();
  const oct = new Date("2026-10-10T08:00:00Z");
  assert.equal(budgetState(db.aiBudget, oct).paused, null, "no limit by default");
  db.aiBudget.monthlyLimitKsh = 1300; // $10
  assert.equal(addUsage(db, "whatsapp-family", 5, oct), null);
  assert.equal(addUsage(db, "brief", 3.2, oct), "warned");
  assert.equal(addUsage(db, "brief", 0.1, oct), null, "warned once");
  assert.equal(budgetState(db.aiBudget, oct).paused, null);
  assert.equal(addUsage(db, "insights", 2, oct), "reached");
  const s = budgetState(db.aiBudget, oct);
  assert.equal(s.paused, "limit");
  assert.equal(s.spentKsh, 1339);
  assert.equal(s.calls, 4);
  const v = budgetView(db.aiBudget, oct);
  assert.deepEqual(v.byFeature.map((f) => f.label), ["Parents' and learners' WhatsApp questions", "Director's briefs", "Dashboard AI insights"]);

  const nov = new Date("2026-11-02T08:00:00Z");
  assert.equal(budgetState(db.aiBudget, nov).paused, null, "a new month starts fresh");
  assert.equal(budgetView(db.aiBudget, nov).lastMonthKsh, 1339);
  assert.equal(addUsage(db, "brief", 9, nov), "warned", "alerts reset each month");

  db.aiBudget.off = true;
  assert.equal(budgetState(db.aiBudget, nov).paused, "off");
});

test("an answer clears the out-of-credit flag; only 12 months are kept", () => {
  const db = seedDatabase();
  db.aiBudget.creditsOutAt = "2026-10-01T00:00:00Z";
  for (let m = 1; m <= 14; m++) addUsage(db, "test", 0.01, new Date(Date.UTC(2025, m, 5)));
  assert.equal(db.aiBudget.creditsOutAt, null);
  assert.equal(Object.keys(db.aiBudget.months).length, 12);
});

test("older data gets an empty AI budget with no limit", () => {
  const db = seedDatabase() as Partial<Database>;
  delete db.aiBudget;
  assert.equal(migrateDatabase(db as Database, {}), true);
  assert.equal(db.aiBudget!.monthlyLimitKsh, null);
  assert.equal(db.aiBudget!.off, false);
});
