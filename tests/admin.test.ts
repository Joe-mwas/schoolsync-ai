import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { filterAiLogs, logAiExchange, MAX_AI_LOGS } from "../src/lib/aiLog.ts";
import { readDb, resetDbCache } from "../src/lib/db.ts";
import { migrateDatabase } from "../src/lib/migrate.ts";
import { canSeeAnnouncement, canTargetClass, visibleAnnouncements } from "../src/lib/permissions.ts";
import { seedDatabase } from "../src/lib/seed.ts";
import type { AiLogEntry, Database } from "../src/lib/types.ts";

test("existing installs: the ADMIN_EMAIL director becomes the administrator", () => {
  const db = seedDatabase() as Partial<Database> & Database;
  db.users = db.users.filter((u) => u.role !== "admin");
  delete (db as Partial<Database>).aiLogs;
  assert.equal(migrateDatabase(db, { ADMIN_EMAIL: " Director@SchoolSync.test " }), true);
  assert.equal(db.users.find((u) => u.id === "u-director")!.role, "admin");
  assert.deepEqual(db.aiLogs, []);
  // Running again changes nothing, and never promotes a second account.
  assert.equal(migrateDatabase(db, { ADMIN_EMAIL: "teacher@schoolsync.test" }), false);
  assert.equal(db.users.find((u) => u.id === "u-teacher1")!.role, "teacher");
});

test("migration needs a matching director and leaves other data alone", () => {
  const db = seedDatabase();
  db.users = db.users.filter((u) => u.role !== "admin");
  assert.equal(migrateDatabase(db, { ADMIN_EMAIL: "nobody@x.org" }), false);
  assert.equal(migrateDatabase(db, {}), false);
  assert.ok(!db.users.some((u) => u.role === "admin"));
});

test("an old data file is upgraded on load", async () => {
  const file = path.join(await mkdtemp(path.join(tmpdir(), "schoolsync-adm-")), "db.json");
  const old = seedDatabase() as Partial<Database>;
  old.users = old.users!.filter((u) => u.role !== "admin");
  delete old.aiLogs;
  await writeFile(file, JSON.stringify(old));
  process.env.DATA_FILE = file;
  process.env.ADMIN_EMAIL = "director@schoolsync.test";
  resetDbCache();
  const db = await readDb();
  assert.equal(db.users.find((u) => u.id === "u-director")!.role, "admin");
  assert.deepEqual(db.aiLogs, []);
  const onDisk = JSON.parse(await readFile(file, "utf8"));
  assert.equal(onDisk.users.find((u: { id: string }) => u.id === "u-director").role, "admin");
  delete process.env.ADMIN_EMAIL;
});

test("administrators see and manage everything a director can", () => {
  const db = seedDatabase();
  const admin = db.users.find((u) => u.role === "admin")!;
  assert.equal(visibleAnnouncements(admin, db).length, db.announcements.length);
  assert.ok(db.announcements.every((a) => canSeeAnnouncement(admin, a, db)));
  assert.equal(canTargetClass(admin, null), true);
});

test("AI exchanges are logged, capped and filterable", async () => {
  process.env.DATA_FILE = path.join(await mkdtemp(path.join(tmpdir(), "schoolsync-ai-")), "db.json");
  resetDbCache();
  await logAiExchange("assistant", "u-parent1", "  When is PTA?  ", "Next Friday at 2 PM.");
  await logAiExchange("whatsapp", "u-parent2", "Fees?", "Ksh 10,000 per term.");
  const db = await readDb();
  assert.equal(db.aiLogs.length, 2);
  assert.equal(db.aiLogs[0].question, "When is PTA?");
  assert.equal(db.aiLogs[0].reviewedAt, null);

  const logs: AiLogEntry[] = [
    { id: "1", channel: "assistant", userId: "a", question: "uniform colour", answer: "blue", createdAt: "2026-10-01T00:00:00Z", flagged: true },
    { id: "2", channel: "whatsapp", userId: "b", question: "fees", answer: "10k", createdAt: "2026-10-02T00:00:00Z", reviewedAt: "2026-10-03T00:00:00Z" },
    { id: "3", channel: "draft", userId: "a", question: "trip notes", answer: "Trip on Friday", createdAt: "2026-10-03T00:00:00Z" },
  ];
  const ids = (f: Parameters<typeof filterAiLogs>[1]) => filterAiLogs(logs, f, (id) => (id === "a" ? "Grace" : "Peter")).map((l) => l.id);
  assert.deepEqual(ids({}), ["3", "2", "1"], "newest first");
  assert.deepEqual(ids({ show: "flagged" }), ["1"]);
  assert.deepEqual(ids({ show: "unreviewed" }), ["3", "1"]);
  assert.deepEqual(ids({ channel: "whatsapp" }), ["2"]);
  assert.deepEqual(ids({ q: "grace" }), ["3", "1"], "search by person");
  assert.deepEqual(ids({ q: "FRIDAY" }), ["3"], "search answers, any case");
  assert.ok(MAX_AI_LOGS >= 1000);
});

test("an incoming WhatsApp from a local-format number finds the parent", async () => {
  process.env.DATA_FILE = path.join(await mkdtemp(path.join(tmpdir(), "schoolsync-in-")), "db.json");
  process.env.DEFAULT_COUNTRY_CODE = "254";
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.WHATSAPP_TOKEN;
  resetDbCache();
  const { handleInboundMessage } = await import("../src/lib/inbound.ts");
  // Demo parent James Kamau is stored as +254700000004.
  const reply = await handleInboundMessage("0700 000 004", "hello");
  assert.equal(reply.userId, "u-parent1");
  assert.equal(reply.phone, "254700000004");
});
