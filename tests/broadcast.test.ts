import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { broadcastAnnouncement } from "../src/lib/broadcast.ts";
import { mutateDb, readDb, resetDbCache } from "../src/lib/db.ts";
import { handleStatusUpdates } from "../src/lib/inbound.ts";

test("broadcast uses text inside the 24h window, the template outside it, and tracks receipts", async () => {
  process.env.DATA_FILE = path.join(await mkdtemp(path.join(tmpdir(), "schoolsync-")), "db.json");
  process.env.WHATSAPP_TOKEN = "test-token";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
  process.env.WHATSAPP_TEMPLATE_NAME = "school_announcement";
  resetDbCache();

  // Parent 1 messaged the school an hour ago; parent 2 never has.
  await mutateDb((db) => {
    db.whatsappMessages.push({
      id: "wa-in",
      direction: "inbound",
      phone: "254700000004",
      userId: "u-parent1",
      body: "hi",
      status: "received",
      error: null,
      announcementId: null,
      createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
  });

  const sent: { to: string; type: string; template?: { name: string } }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    sent.push(body);
    return new Response(JSON.stringify({ messages: [{ id: `wamid.${body.to}` }] }), { status: 200 });
  }) as typeof fetch;

  try {
    // School-wide welcome: teachers and both parents have phones.
    const summary = await broadcastAnnouncement("a-welcome");
    assert.deepEqual(summary, { recipients: 4, sent: 4, simulated: 0, failed: 0, viaTemplate: 3, outsideWindow: 0 });

    const byPhone = Object.fromEntries(sent.map((m) => [m.to, m.type]));
    assert.equal(byPhone["254700000004"], "text");
    assert.equal(byPhone["254700000005"], "template");
    assert.equal(byPhone["254700000002"], "template");
    assert.ok(sent.filter((m) => m.type === "template").every((m) => m.template?.name === "school_announcement"));

    await handleStatusUpdates([
      { messageId: "wamid.254700000005", status: "delivered", error: null },
      { messageId: "wamid.254700000002", status: "failed", error: "131026 Message undeliverable" },
    ]);
    const log = (await readDb()).whatsappMessages.filter((m) => m.announcementId === "a-welcome");
    const status = Object.fromEntries(log.map((m) => [m.phone, m.status]));
    assert.equal(status["254700000005"], "delivered");
    assert.equal(status["254700000002"], "failed");
    assert.equal(status["254700000004"], "sent");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("without a template, recipients outside the window are flagged", async () => {
  process.env.DATA_FILE = path.join(await mkdtemp(path.join(tmpdir(), "schoolsync-")), "db.json");
  delete process.env.WHATSAPP_TOKEN;
  delete process.env.WHATSAPP_TEMPLATE_NAME;
  resetDbCache();
  const summary = await broadcastAnnouncement("a-welcome");
  assert.equal(summary.simulated, 4);
  assert.equal(summary.viaTemplate, 0);
  assert.equal(summary.outsideWindow, 4);
});
