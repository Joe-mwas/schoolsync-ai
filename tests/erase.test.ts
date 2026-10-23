import assert from "node:assert/strict";
import { test } from "node:test";
import { eraseSchool } from "../src/lib/erase.ts";
import { seedDatabase, withDemoHistory } from "../src/lib/seed.ts";

test("erasing keeps only the administrator, the settings and nothing of the school", () => {
  const db = withDemoHistory(seedDatabase());
  db.profile.name = "St. Thomas";
  db.aiBudget.monthlyLimitKsh = 1500;
  db.security.requireTwoStep = true;
  db.push.subscriptions = [
    { userId: "u-admin", endpoint: "https://p/a", keys: { p256dh: "x", auth: "y" }, createdAt: "" },
    { userId: "u-parent1", endpoint: "https://p/b", keys: { p256dh: "x", auth: "y" }, createdAt: "" },
  ];
  const admin = db.users.find((u) => u.role === "admin")!;
  assert.throws(() => eraseSchool(db, db.users.find((u) => u.role === "director")!), /Only the administrator/);
  const counts = eraseSchool(db, admin);
  assert.deepEqual(counts, { people: 9, classes: 2 });
  assert.deepEqual(db.users.map((u) => u.id), ["u-admin"]);
  for (const key of ["classes", "announcements", "events", "posters", "whatsappMessages", "results", "fees", "facts", "duties", "assignments", "documents", "exams", "activity"] as const) {
    assert.equal(db[key].length, 0, key);
  }
  assert.equal(db.profile.name, "", "school details erased too");
  assert.equal(db.aiBudget.monthlyLimitKsh, 1500, "settings stay");
  assert.equal(db.security.requireTwoStep, true);
  assert.deepEqual(db.push.subscriptions.map((s) => s.userId), ["u-admin"]);
});
