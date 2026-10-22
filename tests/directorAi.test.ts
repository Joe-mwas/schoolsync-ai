import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { runAdminTurn } from "../src/lib/adminAi/agent.ts";
import { DIRECTOR_TOOLS, runDirectorTool } from "../src/lib/adminAi/directorTools.ts";
import { ADMIN_TOOLS } from "../src/lib/adminAi/tools.ts";
import { readDb, resetDbCache } from "../src/lib/db.ts";
import { dueForMorningBrief, morningBriefTick } from "../src/lib/morningBrief.ts";
import { morningBriefConfig, nairobiClock } from "../src/lib/morningBriefConfig.ts";
import { seedDatabase } from "../src/lib/seed.ts";
import { setupChecklist } from "../src/lib/setupStatus.ts";

const ctx = () => ({ db: seedDatabase(), env: {}, lastBackupAt: null, now: Date.parse("2026-10-14T08:00:00Z") });
const run = (name: string, input: Record<string, unknown>) => runDirectorTool(ctx(), name, input) as Record<string, any>;

test("the director's AI sees only school and family records, and can't change anything", () => {
  const names = DIRECTOR_TOOLS.map((t) => t.name);
  assert.deepEqual(names, ["fees_overview", "find_family", "fee_statement", "recent_payments", "events_and_activities", "parent_messages", "forward_to_admin"]);
  assert.ok(!names.some((n) => n.startsWith("propose_") || ["setup_status", "health_check", "find_people", "person_details", "whatsapp_messages"].includes(n)));
  for (const t of DIRECTOR_TOOLS) assert.equal((t as { strict?: boolean }).strict, true);
  assert.ok(ADMIN_TOOLS.some((t) => t.name === "setup_status"), "the administrator keeps full access");
  assert.throws(() => runDirectorTool(ctx(), "setup_status", {}), /Unknown tool/);
});

test("fees, families, events and parent messages", () => {
  const fees = run("fees_overview", { days: 7 });
  assert.ok(fees.outstanding > 0 && Array.isArray(fees.topOwing));
  const fam = run("find_family", { query: "Kamau" });
  assert.deepEqual(fam.learners.map((l: { learner: string }) => l.learner), ["Brian Kamau"]);
  assert.equal(fam.learners[0].parents[0].name, "James Kamau");
  assert.equal(fam.parents[0].children[0].admissionNo, "1001");
  assert.equal(run("find_family", { query: "Grace" }).learners.length + run("find_family", { query: "Grace" }).parents.length, 0, "staff aren't searchable");
  assert.throws(() => runDirectorTool(ctx(), "fee_statement", { student_id: "u-parent1" }), /No learner/);
  const ev = run("events_and_activities", { days_back: 30 });
  assert.ok(Array.isArray(ev.upcoming) && Array.isArray(ev.announcements));
  assert.ok(!JSON.stringify(ev).includes("passwordHash"));
});

test("only the administrator and directors can use the AI page", async () => {
  const db = seedDatabase();
  await assert.rejects(runAdminTurn(db.users.find((u) => u.role === "teacher")!, [{ role: "user", text: "hi" }]), /Not allowed/);
  await assert.rejects(runAdminTurn(db.users.find((u) => u.role === "secretary")!, [{ role: "user", text: "hi" }]), /Not allowed/);
});

test("morning brief timing: Nairobi time, weekdays, once a day, directors with WhatsApp", () => {
  assert.deepEqual(morningBriefConfig({}), { minute: 420, label: "07:00", weekdaysOnly: true });
  assert.equal(morningBriefConfig({ MORNING_BRIEF_TIME: "off" }), null);
  assert.deepEqual(morningBriefConfig({ MORNING_BRIEF_TIME: "6:30", MORNING_BRIEF_DAYS: "daily" }), { minute: 390, label: "06:30", weekdaysOnly: false });
  assert.equal(morningBriefConfig({ MORNING_BRIEF_TIME: "25:00" })!.label, "07:00", "nonsense falls back to 07:00");
  assert.deepEqual(nairobiClock(Date.parse("2026-10-14T04:05:00Z")), { date: "2026-10-14", minute: 425, weekday: 3 });

  const db = seedDatabase();
  const cfg = morningBriefConfig({});
  const at = (iso: string) => dueForMorningBrief(db, cfg, Date.parse(iso)).map((u) => u.id);
  assert.deepEqual(at("2026-10-14T03:59:00Z"), [], "06:59 Nairobi: too early");
  assert.deepEqual(at("2026-10-14T04:00:00Z"), ["u-director"], "07:00 Nairobi on a Wednesday");
  assert.deepEqual(at("2026-10-14T09:00:00Z"), [], "noon: too late, wait for tomorrow");
  assert.deepEqual(at("2026-10-17T05:00:00Z"), [], "Saturday");
  assert.deepEqual(dueForMorningBrief(db, morningBriefConfig({ MORNING_BRIEF_DAYS: "daily" }), Date.parse("2026-10-17T05:00:00Z")).map((u) => u.id), ["u-director"]);
  db.users.find((u) => u.id === "u-director")!.morningBriefDate = "2026-10-14";
  assert.deepEqual(at("2026-10-14T05:00:00Z"), [], "already sent today");
  assert.deepEqual(dueForMorningBrief(db, null, Date.parse("2026-10-14T05:00:00Z")), [], "off");
  const item = setupChecklist({}, { lastBackupAt: null }).flatMap((s) => s.items).find((i) => i.id === "morning_brief")!;
  assert.match(item.detail, /07:00 Nairobi time, Monday to Friday/);
});

test("the morning brief goes to the director's WhatsApp once", async () => {
  process.env.DATA_FILE = path.join(await mkdtemp(path.join(tmpdir(), "brief-")), "db.json");
  delete process.env.ANTHROPIC_API_KEY;
  resetDbCache();
  await readDb();
  const now = Date.parse("2026-10-14T04:10:00Z");
  assert.equal(await morningBriefTick(now, {}), 1);
  const db = await readDb();
  const sent = db.whatsappMessages.filter((m) => m.purpose === "morning-brief");
  assert.ok(sent.length >= 1);
  assert.equal(sent[0].userId, "u-director");
  assert.match(sent[0].body, /^☀️ Good morning!/);
  assert.equal(db.users.find((u) => u.id === "u-director")!.morningBriefDate, "2026-10-14");
  assert.equal(await morningBriefTick(now + 5 * 60_000, {}), 0, "not twice");
});
