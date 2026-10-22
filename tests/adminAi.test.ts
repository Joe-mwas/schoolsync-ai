import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { decideAction } from "../src/lib/adminAi/actions.ts";
import { ADMIN_TOOLS, buildProposal, newAction, runReadTool, type ToolContext } from "../src/lib/adminAi/tools.ts";
import { mutateDb, readDb, resetDbCache } from "../src/lib/db.ts";
import { verifyPassword } from "../src/lib/password.ts";
import { LoginLimiter, loginLimiter } from "../src/lib/rateLimit.ts";
import { seedDatabase } from "../src/lib/seed.ts";
import type { Database } from "../src/lib/types.ts";

const ctx = (db: Database = seedDatabase()): ToolContext => ({ db, env: { NODE_ENV: "production" }, lastBackupAt: null, now: Date.now() });
const read = (c: ToolContext, name: string, input: Record<string, unknown> = {}) => runReadTool(c, name, input) as Record<string, any>;

test("every tool has a strict schema that lists all its fields as required", () => {
  for (const t of ADMIN_TOOLS) {
    const schema = t.input_schema as unknown as { properties: Record<string, unknown>; required: string[]; additionalProperties: boolean };
    assert.equal((t as { strict?: boolean }).strict, true, t.name);
    assert.equal(schema.additionalProperties, false, t.name);
    assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort(), t.name);
    assert.ok(t.description && t.description.length > 30, t.name);
  }
});

test("read tools find people by name, phone in any format or admission number", () => {
  const c = ctx();
  assert.deepEqual(read(c, "find_people", { query: "kamau", role: null }).matches.map((m: { id: string }) => m.id).sort(), ["u-parent1", "u-student1"]);
  assert.equal(read(c, "find_people", { query: "0700 000 004", role: null }).matches[0].id, "u-parent1");
  assert.equal(read(c, "find_people", { query: "adm 1001", role: null }).matches.length, 0, "ADM prefix isn't part of the stored number");
  assert.equal(read(c, "find_people", { query: "1001", role: "student" }).matches[0].name, "Brian Kamau");
  assert.throws(() => runReadTool(c, "find_people", { query: " ", role: null }), /Give a name/);
  const james = read(c, "person_details", { person_id: "u-parent1" });
  assert.deepEqual(james.children, ["Brian Kamau"]);
  assert.equal(james.whatsappWindow.canReceiveNormalMessages, false);
  assert.ok(Array.isArray(james.feeBalances));
  assert.throws(() => runReadTool(c, "person_details", { person_id: "nope" }), /find_people/);
  assert.throws(() => runReadTool(c, "fee_statement", { student_id: "u-parent1" }), /not a learner/);
});

test("health check and setup status point at real problems", () => {
  const db = seedDatabase();
  db.users.find((u) => u.id === "u-parent2")!.phone = undefined;
  db.whatsappMessages.push({ id: "w1", direction: "outbound", phone: "254700000004", userId: "u-parent1", body: "Hi", status: "failed", error: "HTTP 400: (#131030) Recipient phone number not in allowed list", announcementId: null, createdAt: new Date().toISOString() });
  const h = read(ctx(db), "health_check");
  assert.deepEqual(h.parentsWithoutWhatsApp.examples.map((e: { id: string }) => e.id), ["u-parent2"]);
  assert.equal(h.failedWhatsAppLast7Days.count, 1);
  assert.match(h.failedWhatsAppLast7Days.byError[0].error, /131030/);
  const failed = read(ctx(db), "whatsapp_messages", { phone: null, person_id: "u-parent1", only_failed: true, days: 7 });
  assert.equal(failed.total, 1);
  const s = read({ ...ctx(db), env: { NODE_ENV: "production", SESSION_SECRET: "very-secret-value-123", ANTHROPIC_API_KEY: "sk-ant-secret-456" } }, "setup_status");
  assert.equal(s.claudeConnected, true);
  assert.match(s.whatsapp.note, /Simulation mode/);
  assert.equal(s.counts.student, 2);
  assert.doesNotMatch(JSON.stringify(s), /very-secret-value-123|sk-ant-secret-456/, "never echoes secret values");
});

test("proposals are checked and described, and change nothing", () => {
  const db = seedDatabase();
  const before = JSON.stringify(db);
  const p = buildProposal(db, "propose_update_person", { person_id: "u-parent1", name: null, phone: "0711 222 333", email: null, admission_no: null, class_id: null, child_ids: ["u-student1", "u-student2"], reason: "Wrong number" });
  assert.equal(p.kind, "update_person");
  assert.match(p.summary, /James Kamau \(Parent\): WhatsApp number → 0711 222 333; children → Brian Kamau, Faith Njeri/);
  assert.deepEqual(p.input, { person_id: "u-parent1", phone: "0711 222 333", child_ids: ["u-student1", "u-student2"] });
  assert.equal(JSON.stringify(db), before);
  const none = { person_id: "u-parent1", name: null, phone: null, email: null, admission_no: null, class_id: null, child_ids: null, reason: "x" };
  assert.throws(() => buildProposal(db, "propose_update_person", none), /Nothing to change/);
  assert.throws(() => buildProposal(db, "propose_update_person", { ...none, child_ids: ["u-parent2"] }), /learners/);
  assert.throws(() => buildProposal(db, "propose_update_person", { ...none, person_id: "u-admin", name: "X" }), /My account/);
  assert.throws(() => buildProposal(db, "propose_reset_password", { person_id: "u-admin", reason: "x" }), /My account/);
  assert.throws(() => buildProposal(db, "propose_resend_message", { message_id: "none", reason: "x" }), /No WhatsApp message/);
  assert.throws(() => buildProposal(db, "propose_match_payment", { payment_id: "none", student_id: "u-student1", reason: "x" }), /No M-Pesa payment/);
});

test("sign-in lockouts can be listed and cleared", () => {
  const l = new LoginLimiter({ windowMs: 60_000, maxPerAccount: 2, maxPerIp: 100 });
  l.recordFailure("1.1.1.1", "ann@x.com", 1000);
  l.recordFailure("2.2.2.2", "ann@x.com", 1000);
  assert.deepEqual(l.lockedAccounts(2000), [], "two addresses, one failure each");
  l.recordFailure("1.1.1.1", "ann@x.com", 1500);
  assert.deepEqual(l.lockedAccounts(2000), [{ account: "ann@x.com", until: 61_000 }]);
  assert.ok(l.retryAfter("1.1.1.1", "ann@x.com", 2000) > 0);
  assert.equal(l.clearAccount("ANN@x.com"), 2);
  assert.equal(l.retryAfter("1.1.1.1", "ann@x.com", 2000), 0);
});

test("approving runs the change once with the admin's permissions; rejecting runs nothing", async () => {
  process.env.DEFAULT_COUNTRY_CODE = "254";
  process.env.DATA_FILE = path.join(await mkdtemp(path.join(tmpdir(), "adminai-")), "db.json");
  resetDbCache();
  const db = await readDb();
  const admin = db.users.find((u) => u.id === "u-admin")!;
  const add = (name: string, input: Record<string, unknown>) =>
    mutateDb((d) => {
      const a = newAction(buildProposal(d, name, input));
      d.adminActions.push(a);
      return a.id;
    });

  const phone = await add("propose_update_person", { person_id: "u-parent1", name: null, phone: "0711 222 333", email: null, admission_no: null, class_id: null, child_ids: null, reason: "x" });
  const out = await decideAction(phone, admin, true);
  assert.equal(out.action.status, "approved");
  assert.equal((await readDb()).users.find((u) => u.id === "u-parent1")!.phone, "+254711222333");
  await assert.rejects(decideAction(phone, admin, true), /already approved/);

  const reset = await add("propose_reset_password", { person_id: "u-parent2", reason: "forgot" });
  const r = await decideAction(reset, admin, true);
  const ann = (await readDb()).users.find((u) => u.id === "u-parent2")!;
  assert.ok(r.temporaryPassword && verifyPassword(r.temporaryPassword, ann.passwordHash));
  assert.equal(ann.mustChangePassword, true);
  assert.doesNotMatch(JSON.stringify((await readDb()).adminActions), new RegExp(r.temporaryPassword!), "password never stored");

  const rejected = await add("propose_update_person", { person_id: "u-student1", name: "Changed", phone: null, email: null, admission_no: null, class_id: null, child_ids: null, reason: "x" });
  assert.equal((await decideAction(rejected, admin, false)).action.status, "rejected");
  assert.equal((await readDb()).users.find((u) => u.id === "u-student1")!.name, "Brian Kamau");

  // A proposal that became invalid fails cleanly when approved.
  const bad = await add("propose_update_person", { person_id: "u-student2", name: null, phone: null, email: null, admission_no: "1001", class_id: null, child_ids: null, reason: "x" });
  const failed = await decideAction(bad, admin, true);
  assert.equal(failed.action.status, "failed");
  assert.match(failed.action.result!, /already belongs to Brian Kamau/);

  loginLimiter.recordFailure("9.9.9.9", "parent@schoolsync.test");
  for (let i = 0; i < 5; i++) loginLimiter.recordFailure("9.9.9.9", "parent@schoolsync.test");
  const unlock = await add("propose_unlock_sign_in", { person_id: "u-parent1", reason: "x" });
  assert.match((await decideAction(unlock, admin, true)).action.result!, /can sign in again/);
  assert.equal(loginLimiter.retryAfter("9.9.9.9", "parent@schoolsync.test"), 0);
});

test("schemas use only features strict tool use supports (anyOf, not type arrays)", () => {
  const walk = (node: unknown, where: string): void => {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    assert.ok(!Array.isArray(n.type), `type array at ${where}`);
    for (const k of ["minimum", "maximum", "minLength", "maxLength", "pattern"]) assert.ok(!(k in n), `${k} at ${where}`);
    for (const [k, v] of Object.entries(n)) walk(v, `${where}.${k}`);
  };
  for (const t of ADMIN_TOOLS) walk(t.input_schema, t.name);
});
