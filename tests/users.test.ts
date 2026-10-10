import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpError } from "../src/lib/errors.ts";
import { verifyPassword } from "../src/lib/password.ts";
import { seedDatabase } from "../src/lib/seed.ts";
import { createPerson, deletePerson, setPassword, updatePerson } from "../src/lib/users.ts";

const rejects = (fn: () => unknown, status: number, re?: RegExp) =>
  assert.throws(fn, (e: unknown) => e instanceof HttpError && e.status === status && (!re || re.test(e.message)));

let n = 0;
const id = () => `u-new${++n}`;

test("new people get a temporary password they must change", () => {
  const db = seedDatabase();
  const u = createPerson(db, { name: "New Parent", email: " NP@School.org ", role: "parent", password: "temp-pass-1", childIds: ["u-student1"] }, id);
  assert.equal(u.email, "np@school.org");
  assert.equal(u.mustChangePassword, true);
  assert.ok(verifyPassword("temp-pass-1", u.passwordHash));
  assert.deepEqual(u.childIds, ["u-student1"]);
});

test("creating people validates input", () => {
  const db = seedDatabase();
  rejects(() => createPerson(db, { name: "X", email: "teacher@schoolsync.test", role: "parent", password: "longenough" }, id), 409);
  rejects(() => createPerson(db, { name: "X", email: "bad", role: "parent", password: "longenough" }, id), 400, /email/);
  rejects(() => createPerson(db, { name: "X", email: "x@y.z", role: "admin", password: "longenough" }, id), 400, /role/);
  rejects(() => createPerson(db, { name: "X", email: "x@y.z", role: "parent", password: "short" }, id), 400, /8 characters/);
  rejects(() => createPerson(db, { name: "X", email: "x@y.z", role: "parent", password: "longenough", childIds: ["u-teacher1"] }, id), 400, /student/);
  rejects(() => createPerson(db, { name: "X", email: "x@y.z", role: "student", password: "longenough", classIds: ["c-grade7", "c-grade8"] }, id), 400);
  rejects(() => createPerson(db, { name: "X", email: "x@y.z", role: "parent", password: "longenough", phone: "call me" }, id), 400, /Phone/);
});

test("editing a teacher's classes keeps class teachers in step", () => {
  const db = seedDatabase();
  updatePerson(db, "u-teacher1", { classIds: ["c-grade8"] });
  // Grade 7 lost its only teacher; Grade 8 keeps its existing teacher.
  assert.equal(db.classes.find((c) => c.id === "c-grade7")!.teacherId, null);
  assert.equal(db.classes.find((c) => c.id === "c-grade8")!.teacherId, "u-teacher2");
  updatePerson(db, "u-teacher1", { classIds: ["c-grade7", "c-grade8"] });
  assert.equal(db.classes.find((c) => c.id === "c-grade7")!.teacherId, "u-teacher1");
});

test("editing validates and only touches given fields", () => {
  const db = seedDatabase();
  const before = db.users.find((u) => u.id === "u-parent1")!;
  const u = updatePerson(db, "u-parent1", { phone: "+254 711 111 111" });
  assert.equal(u.phone, "+254711111111");
  assert.equal(u.name, before.name);
  assert.equal(updatePerson(db, "u-parent1", { phone: "" }).phone, undefined);
  rejects(() => updatePerson(db, "u-parent1", { email: "teacher@schoolsync.test" }), 409);
  rejects(() => updatePerson(db, "u-parent1", { classIds: ["c-grade7"] }), 400);
  rejects(() => updatePerson(db, "nobody", { name: "x" }), 404);
});

test("removing people cleans up links and protects directors", () => {
  const db = seedDatabase();
  rejects(() => deletePerson(db, "u-director", "u-director"), 400, /own account/);
  createPerson(db, { name: "Deputy", email: "deputy@x.org", role: "director", password: "longenough" }, () => "u-deputy");
  deletePerson(db, "u-deputy", "u-director");
  rejects(() => deletePerson(db, "u-teacher1", "u-deputy"), 400, /at least one director/);

  deletePerson(db, "u-deputy", "u-student1");
  assert.deepEqual(db.users.find((u) => u.id === "u-parent1")!.childIds, []);
  deletePerson(db, "u-deputy", "u-teacher1");
  assert.equal(db.classes.find((c) => c.id === "c-grade7")!.teacherId, null);
});

test("setting a password signs out other sessions", () => {
  const db = seedDatabase();
  const u = db.users[0];
  setPassword(u, "brand-new-pw", { mustChange: false });
  assert.equal(u.sessionVersion, 1);
  assert.equal(u.mustChangePassword, false);
  setPassword(u, "another-pw-9", { mustChange: true });
  assert.equal(u.sessionVersion, 2);
  assert.equal(u.mustChangePassword, true);
});

test("parents and students may skip email; staff may not; phones are unique", () => {
  process.env.DEFAULT_COUNTRY_CODE = "254";
  const db = seedDatabase();
  const p = createPerson(db, { name: "Phone Parent", role: "parent", phone: "0733 000 111", password: "longenough" }, id);
  assert.equal(p.email, "");
  assert.equal(p.phone, "+254733000111");
  rejects(() => createPerson(db, { name: "No Contact", role: "parent", password: "longenough" }, id), 400, /phone number to sign in/);
  rejects(() => createPerson(db, { name: "T", role: "teacher", password: "longenough" }, id), 400, /email/);
  rejects(() => createPerson(db, { name: "Dup", role: "parent", phone: "+254 733 000 111", password: "longenough" }, id), 409, /Phone/);
  assert.ok(createPerson(db, { name: "Kid", role: "student", password: "longenough" }, id));
  rejects(() => updatePerson(db, p.id, { phone: "" }), 400, /phone number to sign in/);
});
