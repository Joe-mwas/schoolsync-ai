import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { briefData, formatBrief, parseBriefPeriod, splitMessage } from "../src/lib/brief.ts";
import { routeMessage } from "../src/lib/hub.ts";
import { seedDatabase } from "../src/lib/seed.ts";

const db = seedDatabase();
const u = (id: string) => db.users.find((x) => x.id === id)!;
const NOW = Date.parse("2026-10-10T12:00:00Z");
const text = (action: ReturnType<typeof routeMessage>) => {
  assert.equal(action.type, "reply");
  return (action as { text: string }).text;
};

test("greetings show the menu for each role", () => {
  assert.match(text(routeMessage(db, u("u-parent1"), "Hi")), /1️⃣ Results[\s\S]*2️⃣ Fee balance[\s\S]*4️⃣ Ask a question/);
  assert.match(text(routeMessage(db, u("u-parent1"), "habari")), /Hello James/);
  assert.doesNotMatch(text(routeMessage(db, u("u-teacher1"), "menu")), /Fee balance/);
  assert.match(text(routeMessage(db, u("u-director"), "MENU")), /Brief since your last one/);
});

test("parents get their own children's results and fees, nobody else's", () => {
  const results = text(routeMessage(db, u("u-parent1"), "1"));
  assert.match(results, /Brian Kamau — Term 3 2026 Mid-term/);
  assert.doesNotMatch(results, /Faith/);
  const fees = text(routeMessage(db, u("u-parent1"), "fee balance"));
  assert.match(fees, /Brian Kamau[\s\S]*Balance due: Ksh 5,000/);
  assert.match(text(routeMessage(db, u("u-parent2"), "karo")), /Faith Njeri[\s\S]*Fully paid/);
  assert.match(text(routeMessage(db, u("u-parent2"), "matokeo")), /Faith Njeri/);
});

test("teachers get class summaries; learners can't see fees", () => {
  assert.match(text(routeMessage(db, u("u-teacher1"), "1")), /Grade 7 East — Term 3 2026 Mid-term\nEE 1, ME 3, AE 1, BE 0/);
  assert.match(text(routeMessage(db, u("u-student1"), "2")), /shared with parents/);
  assert.match(text(routeMessage(db, u("u-student1"), "results")), /Brian Kamau/);
});

test("events, ask, and free questions", () => {
  assert.match(text(routeMessage(db, u("u-parent1"), "3", NOW)), /Upcoming events/);
  assert.match(text(routeMessage(db, u("u-parent1"), "4")), /type your question/);
  assert.deepEqual(routeMessage(db, u("u-parent1"), "When is the trip?"), { type: "ai" });
  assert.deepEqual(routeMessage(db, u("u-director"), "How are fees looking?"), { type: "ai" });
});

test("leaders ask for a brief by number or by words", () => {
  const b = (t: string, last?: string) => {
    const a = routeMessage(db, { ...u("u-director"), lastBriefAt: last }, t, NOW);
    assert.equal(a.type, "brief");
    return (a as { period: { since: string; label: string } }).period;
  };
  assert.equal(b("2").since, "2026-10-10T00:00:00.000Z");
  assert.equal(b("brief this week").label, "the last 7 days");
  assert.equal(b("Brief for the month").label, "the last 30 days");
  assert.equal(b("brief", "2026-10-08T06:00:00.000Z").since, "2026-10-08T06:00:00.000Z");
  assert.equal(b("1").label, "the last 7 days", "no previous brief → last 7 days");
  // A very old last brief is capped at a month.
  assert.equal(parseBriefPeriod("brief", "2020-01-01T00:00:00Z", NOW).since, new Date(NOW - 31 * 86_400_000).toISOString());
  // Parents typing "brief" just ask the AI.
  assert.deepEqual(routeMessage(db, u("u-parent1"), "brief"), { type: "ai" });
});

test("the brief covers fees, results, parents and events", () => {
  const d = structuredClone(db);
  d.whatsappMessages.push(
    { id: "m1", direction: "inbound", phone: "254700000004", userId: "u-parent1", body: "When is the trip?", status: "received", error: null, announcementId: null, createdAt: "2026-10-10T08:00:00Z" },
    { id: "m2", direction: "inbound", phone: "254700000005", userId: "u-parent2", body: "Fees?", status: "received", error: null, announcementId: null, createdAt: "2026-10-10T09:00:00Z" },
    { id: "m3", direction: "outbound", phone: "254700000005", userId: "u-parent2", body: "Paid", status: "sent", error: null, announcementId: null, createdAt: "2026-10-10T09:00:01Z" },
  );
  const data = briefData(d, { since: "2026-10-10T00:00:00Z", label: "today" }, NOW);
  assert.deepEqual(data.parentMessages, { count: 2, parents: 2, unanswered: 1, samples: ["When is the trip?", "Fees?"] });
  const brief = formatBrief("Sunrise Academy", data);
  assert.match(brief, /📋 Sunrise Academy brief — today/);
  assert.match(brief, /Ksh 25,000 of Ksh 30,000 collected \(83%\); Ksh 5,000 outstanding/);
  assert.match(brief, /Grade 7 East: Ksh 5,000 owed by 1/);
  assert.match(brief, /Latest: Term 3 2026 Mid-term[\s\S]*Grade 8 West: EE 1, ME 2, AE 1, BE 1; weakest area Integrated Science/);
  assert.match(brief, /2 messages from 2 parents; 1 without a reply/);
});

test("long WhatsApp messages split under the limit", () => {
  assert.deepEqual(splitMessage("short"), ["short"]);
  const parts = splitMessage(["a".repeat(3000), "b".repeat(3000), "c".repeat(100)].join("\n\n"), 3800);
  assert.equal(parts.length, 2);
  assert.ok(parts.every((p) => p.length <= 3800));
  assert.equal(parts.join("\n\n"), ["a".repeat(3000), "b".repeat(3000), "c".repeat(100)].join("\n\n"));
});

test("WhatsApp end to end without the AI: menu, fees, brief", async () => {
  process.env.DATA_FILE = path.join(await mkdtemp(path.join(tmpdir(), "schoolsync-hub-")), "db.json");
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.WHATSAPP_TOKEN;
  process.env.DEFAULT_COUNTRY_CODE = "254";
  const { resetDbCache, readDb } = await import("../src/lib/db.ts");
  resetDbCache();
  const { handleInboundMessage } = await import("../src/lib/inbound.ts");
  assert.match((await handleInboundMessage("+254700000004", "Hi")).body, /1️⃣ Results/);
  assert.match((await handleInboundMessage("0700000004", "2")).body, /Balance due: Ksh 5,000/);
  assert.match((await handleInboundMessage("+254700000004", "Is there school on Monday?")).body, /office will get back[\s\S]*Reply MENU/);
  // The director (demo phone +254700000001) asks for a brief.
  const brief = await handleInboundMessage("+254700000001", "brief today");
  assert.match(brief.body, /brief — today[\s\S]*FEES[\s\S]*RESULTS[\s\S]*PARENTS[\s\S]*EVENTS/);
  assert.ok((await readDb()).users.find((x) => x.id === "u-director")!.lastBriefAt, "last brief time saved");
});
