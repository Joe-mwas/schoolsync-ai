import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSchoolContext } from "../src/lib/ai.ts";
import { factsFor } from "../src/lib/facts.ts";
import { routeMessage } from "../src/lib/hub.ts";
import { canManageAnnouncement, canPublish, canSeeAnnouncement, canTargetClass, ROLE_LABELS } from "../src/lib/permissions.ts";
import { canEditResults, canViewResults, saveResults } from "../src/lib/results.ts";
import { seedDatabase } from "../src/lib/seed.ts";
import { isLeader, isOffice, LEADERS, OFFICE, STAFF } from "../src/lib/types.ts";
import { createPerson } from "../src/lib/users.ts";

const db = seedDatabase();
const sec = db.users.find((u) => u.id === "u-secretary")!;

test("the secretary is office staff, not a school leader", () => {
  assert.equal(ROLE_LABELS.secretary, "Secretary");
  assert.equal(isOffice("secretary"), true);
  assert.equal(isLeader("secretary"), false);
  assert.ok(OFFICE.includes("secretary") && STAFF.includes("secretary"));
  assert.ok(!LEADERS.includes("secretary"), "people, classes, imports and backups stay with leaders");
});

test("she can announce to the whole school or any class and manage any announcement", () => {
  assert.equal(canPublish(sec), true);
  assert.equal(canTargetClass(sec, null), true);
  assert.equal(canTargetClass(sec, "c-grade8"), true);
  for (const a of db.announcements) {
    assert.equal(canSeeAnnouncement(sec, a, db), true);
    assert.equal(canManageAnnouncement(sec, a), true);
  }
});

test("she can view every class's results but not change them", () => {
  for (const c of db.classes) {
    assert.equal(canViewResults(sec, c.id), true);
    assert.equal(canEditResults(sec, c.id), false);
  }
  assert.throws(() => saveResults(db, sec, "c-grade7", "Term 3 2026 Mid-term", []), /own classes/);
  const teacher = db.users.find((u) => u.id === "u-teacher1")!;
  assert.equal(canViewResults(teacher, "c-grade8"), false, "teachers still see only their classes");
});

test("she gets the brief, staff-only facts and school-wide figures from the AI", () => {
  assert.equal(routeMessage(db, sec, "brief today").type, "brief");
  const menu = routeMessage(db, sec, "menu");
  assert.match((menu as { text: string }).text, /Brief/);
  assert.ok(factsFor(db, sec).some((f) => f.visibleTo === "staff"));
  assert.match(buildSchoolContext(sec, db), /Fees: /);
});

test("secretary accounts sign in with email", () => {
  const d = seedDatabase();
  assert.throws(() => createPerson(d, { name: "New Sec", role: "secretary", password: "longenough1" }, () => "u-x"), /email/i);
  assert.equal(createPerson(d, { name: "New Sec", role: "secretary", email: "sec2@school.test", password: "longenough1" }, () => "u-x").role, "secretary");
});
