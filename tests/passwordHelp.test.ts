import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyPassword } from "../src/lib/password.ts";
import { dismissRequest, passwordHelpMessage, requestPasswordHelp, resetFromRequest } from "../src/lib/passwordHelp.ts";
import { seedDatabase } from "../src/lib/seed.ts";

const u = (db: ReturnType<typeof seedDatabase>, id: string) => db.users.find((x) => x.id === id)!;

test("a forgotten-password request finds the account, once", () => {
  const db = seedDatabase();
  const { request, isNew } = requestPasswordHelp(db, { contact: " Teacher@SchoolSync.test ", name: "Peter", role: "teacher", note: "Grade 7" });
  assert.ok(isNew);
  assert.equal(request.userId, "u-teacher1");
  assert.equal(requestPasswordHelp(db, { contact: "+254 700 000 002", name: "Peter again" }).isNew, false, "same account by phone: no second alert");
  const stranger = requestPasswordHelp(db, { contact: "nobody@x.y", name: "Nobody", role: "boss" });
  assert.equal(stranger.request.userId, null);
  assert.equal(stranger.request.role, null, "unknown roles are dropped");
  assert.throws(() => requestPasswordHelp(db, { contact: "", name: "X" }), /email or phone/);
  assert.throws(() => requestPasswordHelp(db, { contact: "a@b.c", name: " " }), /name/);
  const msg = passwordHelpMessage(db, request, "St. Thomas");
  assert.match(msg, /Peter Otieno \(Teacher, teacher@schoolsync.test/);
  assert.match(msg, /Note: Grade 7/);
  assert.match(passwordHelpMessage(db, stranger.request, "St. Thomas"), /No account matches/);
});

test("only the administrator resets from a request; the person must then choose their own", () => {
  const db = seedDatabase();
  const { request } = requestPasswordHelp(db, { contact: "teacher@schoolsync.test", name: "Peter" });
  for (const id of ["u-director", "u-headteacher", "u-secretary"]) assert.throws(() => resetFromRequest(db, u(db, id), request.id), /Only the administrator/);
  const { password, user } = resetFromRequest(db, u(db, "u-admin"), request.id);
  assert.ok(verifyPassword(password, user.passwordHash));
  assert.equal(user.mustChangePassword, true);
  assert.equal(request.status, "reset");
  assert.throws(() => resetFromRequest(db, u(db, "u-admin"), request.id), /already handled/);
  // A new request is allowed once the old one is handled.
  assert.ok(requestPasswordHelp(db, { contact: "teacher@schoolsync.test", name: "Peter" }).isNew);
  const stranger = requestPasswordHelp(db, { contact: "nobody@x.y", name: "Nobody" }).request;
  assert.throws(() => resetFromRequest(db, u(db, "u-admin"), stranger.id), /No account/);
  assert.equal(dismissRequest(db, u(db, "u-admin"), stranger.id).status, "dismissed");
});

test("an administrator's own account isn't reset from the sign-in page", () => {
  const db = seedDatabase();
  const { request } = requestPasswordHelp(db, { contact: "admin@schoolsync.test", name: "Admin" });
  assert.throws(() => resetFromRequest(db, u(db, "u-admin"), request.id), /My account/);
});
