import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_ACTIVITY, recordActivity } from "../src/lib/activity.ts";
import { migrateDatabase } from "../src/lib/migrate.ts";
import { seedDatabase } from "../src/lib/seed.ts";
import { createSessionToken, createTicket, readSessionToken, readTicket } from "../src/lib/session.ts";
import { base32Decode, base32Encode, codeAt, newBackupCodes, newSecret, otpauthUrl, spendBackupCode, stepAt, verifyCode } from "../src/lib/totp.ts";
import type { Database } from "../src/lib/types.ts";
import { setPassword } from "../src/lib/users.ts";

// RFC 6238 appendix B: the ASCII key "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

test("authenticator codes match the RFC 6238 test vectors", () => {
  assert.equal(RFC_SECRET, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.equal(base32Decode(RFC_SECRET).toString(), "12345678901234567890");
  // The RFC lists 8 digits; apps show the last 6.
  assert.equal(codeAt(RFC_SECRET, stepAt(59_000)), "287082");
  assert.equal(codeAt(RFC_SECRET, stepAt(1_111_111_109_000)), "081804");
  assert.equal(codeAt(RFC_SECRET, stepAt(2_000_000_000_000)), "279037");
});

test("a code is accepted once, within a step of clock drift", () => {
  const secret = newSecret();
  const now = 1_800_000_000_000;
  const step = stepAt(now);
  assert.equal(verifyCode(secret, codeAt(secret, step), { now }), step);
  assert.equal(verifyCode(secret, codeAt(secret, step - 1), { now }), step - 1, "the previous code still works");
  assert.equal(verifyCode(secret, codeAt(secret, step + 1), { now }), step + 1, "a phone a little ahead works");
  assert.equal(verifyCode(secret, codeAt(secret, step - 3), { now }), null, "an old code doesn't");
  assert.equal(verifyCode(secret, codeAt(secret, step), { now, lastStep: step }), null, "the same code can't be used twice");
  assert.equal(verifyCode(secret, "12345", { now }), null);
  assert.equal(verifyCode(secret, "abcdef", { now }), null);
  assert.equal(verifyCode(secret, ` ${codeAt(secret, step).slice(0, 3)} ${codeAt(secret, step).slice(3)} `, { now }), step, "spaces are ignored");
});

test("backup codes work once each and are stored only as hashes", () => {
  const { codes, hashes } = newBackupCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const c of codes) assert.match(c, /^[a-z2-7]{4}-[a-z2-7]{4}$/);
  assert.ok(hashes.every((h) => !codes.some((c) => h.includes(c.replace("-", "")))));
  const left = spendBackupCode(hashes, codes[3].toUpperCase().replace("-", " "));
  assert.equal(left?.length, 9);
  assert.equal(spendBackupCode(left!, codes[3]), null, "a used code is gone");
  assert.equal(spendBackupCode(hashes, "aaaa-aaaa"), null);
});

test("the authenticator link names the school and account", () => {
  const url = otpauthUrl("St. Thomas (SchoolSync)", "admin@school.ac.ke", "ABC234");
  assert.ok(url.startsWith("otpauth://totp/St.%20Thomas%20(SchoolSync)%3Aadmin%40school.ac.ke?secret=ABC234&issuer="));
});

test("a two-step ticket can't be used as a session, and expires", () => {
  const now = Date.now();
  const ticket = createTicket("u-1", 2, now);
  assert.deepEqual(readTicket(ticket, now), { uid: "u-1", version: 2 });
  assert.equal(readSessionToken(ticket, now), null, "not a session");
  assert.equal(readTicket(createSessionToken("u-1", 2, now), now), null, "a session isn't a ticket");
  assert.equal(readTicket(ticket, now + 6 * 60_000), null, "expired after five minutes");
});

test("staff sessions last only the idle time and keep their sign-in time when extended", () => {
  const now = 1_800_000_000_000;
  const token = createSessionToken("u-1", 0, now, { ttlSeconds: 30 * 60 });
  assert.ok(readSessionToken(token, now + 29 * 60_000));
  assert.equal(readSessionToken(token, now + 31 * 60_000), null);
  const extended = createSessionToken("u-1", 0, now + 25 * 60_000, { ttlSeconds: 30 * 60, issuedAt: now });
  assert.equal(readSessionToken(extended, now + 50 * 60_000)?.iat, now);
});

test("a password reset by the school turns off two-step sign-in; a person's own change keeps it", () => {
  const db = seedDatabase();
  const teacher = db.users.find((u) => u.role === "teacher")!;
  teacher.twoStep = { secret: newSecret(), enabledAt: new Date().toISOString(), backupCodes: [] };
  setPassword(teacher, "Another-Passw0rd!", { mustChange: false });
  assert.ok(teacher.twoStep, "own change keeps it");
  setPassword(teacher, "Temporary-Passw0rd!", { mustChange: true });
  assert.equal(teacher.twoStep, null, "reset clears it");
});

test("the activity log records entries and keeps only the newest", () => {
  const db = seedDatabase();
  for (let i = 0; i < MAX_ACTIVITY + 5; i++) {
    recordActivity(db, { userId: "u-admin", name: "Admin", role: "admin", kind: "signin", action: `Signed in ${i}`, detail: "  spaced   out  " });
  }
  assert.equal(db.activity.length, MAX_ACTIVITY);
  assert.equal(db.activity[0].action, "Signed in 5");
  assert.equal(db.activity.at(-1)!.detail, "spaced out");
});

test("older data gets sign-in security defaults and an empty activity log", () => {
  const db = seedDatabase() as Partial<Database>;
  delete db.security;
  delete db.activity;
  assert.equal(migrateDatabase(db as Database, {}), true);
  assert.deepEqual(db.security, { requireTwoStep: false, idleMinutes: 30 });
  assert.deepEqual(db.activity, []);
  (db as Database).security = { requireTwoStep: true, idleMinutes: 7 };
  migrateDatabase(db as Database, {});
  assert.deepEqual(db.security, { requireTwoStep: true, idleMinutes: 30 }, "an odd idle time falls back to 30 minutes");
});

test("an emergency reset from the hosting settings lets a locked-out administrator back in, once", async () => {
  const { applyAdminReset } = await import("../src/lib/migrate.ts");
  const { verifyPassword } = await import("../src/lib/password.ts");
  const db = seedDatabase();
  const admin = db.users.find((u) => u.role === "admin")!;
  admin.twoStep = { secret: newSecret(), enabledAt: new Date().toISOString(), backupCodes: [] };
  const env = { ADMIN_EMAIL: "Admin@SchoolSync.test", ADMIN_RESET_PASSWORD: "Rescue-Me-2026" };
  assert.equal(applyAdminReset(db, {}), false, "nothing without the setting");
  assert.equal(applyAdminReset(db, { ADMIN_RESET_PASSWORD: "short" }), false);
  assert.equal(applyAdminReset(db, env), true);
  assert.ok(verifyPassword("Rescue-Me-2026", admin.passwordHash));
  assert.equal(admin.mustChangePassword, true);
  assert.equal(admin.twoStep, null);
  assert.equal(db.activity.at(-1)!.action, "Emergency password reset");
  setPassword(admin, "My-New-Passw0rd!", { mustChange: false });
  assert.equal(applyAdminReset(db, env), false, "the same value isn't applied again on restart");
  assert.ok(verifyPassword("My-New-Passw0rd!", admin.passwordHash));
  assert.equal(applyAdminReset(db, { ...env, ADMIN_EMAIL: "nobody@x.test" }), true, "a new value works; with one administrator, the email can be off");
});
