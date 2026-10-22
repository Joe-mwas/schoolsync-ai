import assert from "node:assert/strict";
import { test } from "node:test";
import { createDuty, deleteDuty, dutiesFor, dutyMessage, setDutyStatus } from "../src/lib/duties.ts";
import { canManageAnnouncement, canTargetClass, ROLE_LABELS } from "../src/lib/permissions.ts";
import { canEditResults, canViewResults } from "../src/lib/results.ts";
import { seedDatabase } from "../src/lib/seed.ts";
import { canManageRole, DUTY_MANAGERS, DUTY_VIEWERS, FEE_VIEWERS, isLeader, isOffice, isSchoolWide, LEADERS, PEOPLE_MANAGERS, POSTER_MAKERS, WHATSAPP_INBOX } from "../src/lib/types.ts";
import { assertCanManage, createPerson } from "../src/lib/users.ts";

const db = seedDatabase();
const u = (id: string) => db.users.find((x) => x.id === id)!;
const ht = () => u("u-headteacher");

test("the headteacher is second in command for education", () => {
  assert.equal(ROLE_LABELS.headteacher, "Headteacher");
  assert.ok(PEOPLE_MANAGERS.includes("headteacher") && FEE_VIEWERS.includes("headteacher") && DUTY_MANAGERS.includes("headteacher") && isSchoolWide("headteacher"));
  assert.ok(!LEADERS.includes("headteacher") && !isLeader("headteacher"), "no backups or director-level account control");
  assert.equal(isOffice("headteacher"), false, "fees are view-only");
  for (const c of db.classes) assert.ok(canEditResults(ht(), c.id) && canViewResults(ht(), c.id));
  assert.ok(canTargetClass(ht(), null) && db.announcements.every((a) => canManageAnnouncement(ht(), a)));
});

test("the headteacher manages teachers, learners and parents, nobody above", () => {
  for (const r of ["teacher", "student", "parent"]) assert.equal(canManageRole("headteacher", r), true, r);
  for (const r of ["secretary", "headteacher", "director", "admin"]) assert.equal(canManageRole("headteacher", r), false, r);
  assert.throws(() => assertCanManage(ht(), u("u-director")), /teachers, learners and parents only/);
  assert.throws(() => assertCanManage(ht(), { role: "secretary" }), /teachers, learners and parents only/);
  assert.doesNotThrow(() => assertCanManage(ht(), u("u-teacher1")));
  for (const r of ["admin", "director", "headteacher", "secretary", "teacher", "parent", "student"]) {
    assert.equal(canManageRole("director", r), false, `director can't manage ${r}`);
    assert.equal(canManageRole("admin", r), true, `admin manages ${r}`);
  }
  assert.equal(canManageRole("secretary", "teacher"), false);
  const d = seedDatabase();
  assert.throws(() => createPerson(d, { name: "H", role: "headteacher", password: "longenough1" }, () => "u-h2"), /email/i);
});

test("the director's menu is kept to the essentials", () => {
  for (const group of [PEOPLE_MANAGERS, WHATSAPP_INBOX, POSTER_MAKERS, DUTY_MANAGERS]) assert.ok(!group.includes("director"));
  assert.ok(DUTY_VIEWERS.includes("director") && FEE_VIEWERS.includes("director") && isOffice("director"));
  const d = seedDatabase();
  const director = d.users.find((x) => x.id === "u-director")!;
  assert.equal(dutiesFor(d, director).length, d.duties.length, "the director follows every duty");
  assert.throws(() => createDuty(d, director, { title: "x", teacherIds: ["u-teacher1"] }), /Only the headteacher or administrator/);
  assert.throws(() => setDutyStatus(d, director, "duty-demo", "done"), /isn't yours/);
});

test("duties: assigned by the headteacher, seen and finished by the teacher", () => {
  const d = seedDatabase();
  const head = d.users.find((x) => x.id === "u-headteacher")!;
  const t1 = d.users.find((x) => x.id === "u-teacher1")!;
  const t2 = d.users.find((x) => x.id === "u-teacher2")!;
  assert.throws(() => createDuty(d, t1, { title: "x", teacherIds: [t2.id] }), /Only the headteacher/);
  assert.throws(() => createDuty(d, head, { title: " ", teacherIds: [t1.id] }), /title/);
  assert.throws(() => createDuty(d, head, { title: "Exams", teacherIds: [] }), /at least one teacher/);
  assert.throws(() => createDuty(d, head, { title: "Exams", teacherIds: ["u-parent1"] }), /only be given to teachers/);
  assert.throws(() => createDuty(d, head, { title: "Exams", teacherIds: [t1.id], startDate: "2026-11-10", endDate: "2026-11-01" }), /before the start/);
  const duty = createDuty(d, head, { title: "Invigilate Grade 8 exams", details: "Hall B", teacherIds: [t1.id, t2.id, t1.id], startDate: "2026-11-10", endDate: "2026-11-12" });
  assert.deepEqual(duty.teacherIds, [t1.id, t2.id]);
  assert.ok(dutiesFor(d, t2).some((x) => x.id === duty.id));
  assert.ok(!dutiesFor(d, d.users.find((x) => x.id === "u-teacher2")!).some((x) => x.id === "duty-demo"), "teachers see only their own");
  assert.equal(dutiesFor(d, head).length, d.duties.length, "managers see all");
  assert.match(dutyMessage(duty, t2, head, "Sunrise Academy"), /New duty for Mary\n\*Invigilate Grade 8 exams\* \(2026-11-10 to 2026-11-12\)\nHall B\nFrom Samuel Mutiso/);
  assert.throws(() => setDutyStatus(d, d.users.find((x) => x.id === "u-parent1")!, duty.id, "done"), /isn't yours/);
  assert.equal(setDutyStatus(d, t2, duty.id, "done").doneBy, t2.id);
  assert.equal(setDutyStatus(d, head, duty.id, "open").doneAt, null);
  assert.throws(() => deleteDuty(d, t1, duty.id), /Only the headteacher/);
  deleteDuty(d, head, duty.id);
  assert.equal(d.duties.some((x) => x.id === duty.id), false);
});
