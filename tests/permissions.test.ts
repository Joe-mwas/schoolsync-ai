import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSchoolContext } from "../src/lib/ai.ts";
import {
  canManageAnnouncement,
  canSeeAnnouncement,
  canTargetClass,
  visibleAnnouncements,
  whatsappRecipients,
} from "../src/lib/permissions.ts";
import { seedDatabase } from "../src/lib/seed.ts";

const db = seedDatabase();
const user = (id: string) => db.users.find((u) => u.id === id)!;
const grade7Trip = db.announcements.find((a) => a.id === "a-grade7-trip")!;

test("class announcements reach only that class's students and parents", () => {
  assert.equal(canSeeAnnouncement(user("u-student1"), grade7Trip, db), true);
  assert.equal(canSeeAnnouncement(user("u-parent1"), grade7Trip, db), true);
  assert.equal(canSeeAnnouncement(user("u-student2"), grade7Trip, db), false);
  assert.equal(canSeeAnnouncement(user("u-parent2"), grade7Trip, db), false);
  // Teachers aren't in this announcement's audience, except its author.
  assert.equal(canSeeAnnouncement(user("u-teacher2"), grade7Trip, db), false);
  assert.equal(canSeeAnnouncement(user("u-teacher1"), grade7Trip, db), true);
  assert.equal(canSeeAnnouncement(user("u-director"), grade7Trip, db), true);
});

test("visible announcements are newest first", () => {
  const list = visibleAnnouncements(user("u-parent1"), db);
  assert.deepEqual(list.map((a) => a.id), ["a-grade7-trip", "a-welcome"]);
});

test("teachers can only target their own classes", () => {
  assert.equal(canTargetClass(user("u-teacher1"), "c-grade7"), true);
  assert.equal(canTargetClass(user("u-teacher1"), "c-grade8"), false);
  assert.equal(canTargetClass(user("u-teacher1"), null), false);
  assert.equal(canTargetClass(user("u-director"), null), true);
  assert.equal(canTargetClass(user("u-parent1"), "c-grade7"), false);
});

test("only the author or a director can manage an announcement", () => {
  assert.equal(canManageAnnouncement(user("u-teacher1"), grade7Trip), true);
  assert.equal(canManageAnnouncement(user("u-teacher2"), grade7Trip), false);
  assert.equal(canManageAnnouncement(user("u-director"), grade7Trip), true);
});

test("WhatsApp recipients match the audience, have phones, and exclude the author", () => {
  assert.deepEqual(whatsappRecipients(grade7Trip, db).map((u) => u.id), ["u-parent1"]);
  const welcome = db.announcements.find((a) => a.id === "a-welcome")!;
  assert.deepEqual(
    whatsappRecipients(welcome, db).map((u) => u.id).sort(),
    ["u-parent1", "u-parent2", "u-teacher1", "u-teacher2"],
  );
});

test("assistant context only includes announcements the user may see", () => {
  const parent2 = buildSchoolContext(user("u-parent2"), db);
  assert.ok(parent2.includes("Welcome to Term 3"));
  assert.ok(!parent2.includes("Grade 7 science trip"));
  assert.ok(parent2.includes("Children: Faith Njeri"));
  assert.ok(buildSchoolContext(user("u-parent1"), db).includes("Grade 7 science trip"));
});
