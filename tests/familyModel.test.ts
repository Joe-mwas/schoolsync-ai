import assert from "node:assert/strict";
import { test } from "node:test";
import { FAMILY_MODELS, MODEL, modelFor } from "../src/lib/ai.ts";
import { migrateDatabase } from "../src/lib/migrate.ts";
import { seedDatabase } from "../src/lib/seed.ts";
import type { Database } from "../src/lib/types.ts";

test("parents and learners get the model the school chose; staff always the top model", () => {
  const db = seedDatabase();
  assert.equal(db.aiSettings.familyModel, "economy", "economy by default");
  for (const role of ["parent", "student"] as const) assert.equal(modelFor({ role }, db), "claude-haiku-5-5");
  for (const role of ["admin", "director", "headteacher", "secretary", "teacher"] as const) assert.equal(modelFor({ role }, db), MODEL);
  db.aiSettings.familyModel = "balanced";
  assert.equal(modelFor({ role: "parent" }, db), "claude-sonnet-5-5");
  db.aiSettings.familyModel = "top";
  assert.equal(modelFor({ role: "student" }, db), MODEL);
  assert.equal(FAMILY_MODELS.top.model, "claude-opus-5-5");
});

test("older data gets the economy model for families", () => {
  const db = seedDatabase() as Partial<Database>;
  delete db.aiSettings;
  assert.equal(migrateDatabase(db as Database, {}), true);
  assert.deepEqual(db.aiSettings, { familyModel: "economy" });
  (db as Database).aiSettings = { familyModel: "huge" as never };
  migrateDatabase(db as Database, {});
  assert.equal((db as Database).aiSettings.familyModel, "economy", "an unknown value is reset");
});
