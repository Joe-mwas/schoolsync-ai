import assert from "node:assert/strict";
import { test } from "node:test";
import { testAiConnection } from "../src/lib/ai.ts";
import { configuredPublicUrl, displayOrigin } from "../src/lib/publicUrl.ts";
import { countReady, setupChecklist } from "../src/lib/setupStatus.ts";
import { recordWebhook, webhookActivity } from "../src/lib/webhookActivity.ts";
import { checkWhatsAppCredentials } from "../src/lib/whatsapp.ts";

const NOW = Date.parse("2026-10-10T12:00:00Z");
const status = (env: Record<string, string | undefined>, id: string, lastBackupAt: string | null = null) =>
  setupChecklist(env, { lastBackupAt, now: NOW }).flatMap((s) => s.items).find((i) => i.id === id)!.status;

test("a fresh production deploy shows what's missing", () => {
  const env = { NODE_ENV: "production", SESSION_SECRET: "x".repeat(32), DATA_FILE: "/var/data/db.json", DEFAULT_COUNTRY_CODE: "254" };
  const sections = setupChecklist(env, { lastBackupAt: "2026-10-10T08:00:00Z", now: NOW });
  assert.deepEqual(sections.map((s) => s.id), ["basics", "ai", "whatsapp", "mpesa"]);
  assert.ok(sections[3].items.every((i) => i.status === "optional"), "M-Pesa is optional until started");
  assert.ok(sections[0].items.filter((i) => !i.recommended).every((i) => i.status === "ok"), "required basics all ready");
  assert.equal(status(env, "school-name"), "optional");
  assert.equal(status({ ...env, SCHOOL_NAME: "Sunrise Academy" }, "school-name"), "ok");
  assert.equal(status(env, "anthropic-key"), "missing");
  assert.equal(status(env, "whatsapp_token"), "missing");
  assert.equal(status(env, "whatsapp_template_name"), "optional");
  // 5 basics + AI key + 4 WhatsApp settings are required; the template is optional.
  assert.deepEqual(countReady(sections), { ready: 5, total: 10 });
});

test("everything connected counts as ready", () => {
  const env = {
    NODE_ENV: "production", SESSION_SECRET: "s", DATA_FILE: "/d", DEFAULT_COUNTRY_CODE: "254", ANTHROPIC_API_KEY: "k",
    WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "1", WHATSAPP_VERIFY_TOKEN: "v", WHATSAPP_APP_SECRET: "a", WHATSAPP_TEMPLATE_NAME: "school_announcement",
  };
  assert.deepEqual(countReady(setupChecklist(env, { lastBackupAt: "2026-10-10T08:00:00Z", now: NOW })), { ready: 10, total: 10 });
});

test("M-Pesa settings count once the school starts setting them up", () => {
  const base = { NODE_ENV: "production", SESSION_SECRET: "s", DATA_FILE: "/d", DEFAULT_COUNTRY_CODE: "254" };
  const started = { ...base, MPESA_SHORTCODE: "247247" };
  assert.equal(status(started, "mpesa_consumer_key"), "missing");
  assert.equal(status(started, "mpesa_callback_token"), "missing");
  assert.equal(status({ ...started, MPESA_CALLBACK_TOKEN: "short" }, "mpesa_callback_token"), "missing");
  assert.equal(status({ ...started, MPESA_CALLBACK_TOKEN: "a".repeat(32) }, "mpesa_callback_token"), "ok");
  assert.equal(status(started, "mpesa_env"), "warn");
  assert.equal(status({ ...started, MPESA_ENV: "production" }, "mpesa_env"), "ok");
});

test("flags risky or stale setups", () => {
  assert.equal(status({ NODE_ENV: "production" }, "session-secret"), "missing");
  assert.equal(status({ NODE_ENV: "production", SESSION_SECRET: "change-me" }, "session-secret"), "missing");
  assert.equal(status({ NODE_ENV: "production" }, "data-file"), "warn");
  assert.equal(status({ NODE_ENV: "production", SEED_DEMO: "1" }, "demo-accounts"), "warn");
  assert.equal(status({}, "backups", null), "warn");
  assert.equal(status({}, "backups", "2026-10-01T00:00:00Z"), "warn");
  assert.equal(status({ WHATSAPP_TOKEN: "   " }, "whatsapp_token"), "missing", "blank counts as missing");
  // Development doesn't need production-only settings.
  assert.equal(status({ NODE_ENV: "development" }, "session-secret"), "optional");
});

test("public URL comes from configuration, never from request headers", () => {
  assert.equal(configuredPublicUrl({ RENDER_EXTERNAL_URL: "https://schoolsync-ai-x.onrender.com/" }), "https://schoolsync-ai-x.onrender.com");
  assert.equal(configuredPublicUrl({ PUBLIC_URL: "https://sync.school.org", RENDER_EXTERNAL_URL: "https://a.onrender.com" }), "https://sync.school.org");
  assert.equal(configuredPublicUrl({ PUBLIC_URL: "https://evil.example/path" }), null, "only a bare origin");
  assert.equal(configuredPublicUrl({}), null);
  const h = new Headers({ host: "school.example", "x-forwarded-proto": "https" });
  assert.equal(displayOrigin(h, {}), "https://school.example");
  assert.equal(displayOrigin(h, { RENDER_EXTERNAL_URL: "https://real.onrender.com" }), "https://real.onrender.com");
});

test("records when Meta last called the webhook", () => {
  recordWebhook("received");
  assert.ok(webhookActivity().receivedAt);
});

test("AI test explains a missing key without calling the API", async () => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  const r = await testAiConnection();
  assert.equal(r.ok, false);
  assert.match(r.message, /ANTHROPIC_API_KEY/);
});

test("WhatsApp credential check reports Meta's answer in plain words", async () => {
  process.env.WHATSAPP_TOKEN = "tok";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ display_phone_number: "+1 555 0100", verified_name: "SchoolSync Academy", quality_rating: "GREEN" }))) as typeof fetch;
    const ok = await checkWhatsAppCredentials();
    assert.equal(ok.ok, true);
    assert.match(ok.message, /\+1 555 0100 \(SchoolSync Academy, quality GREEN\)/);

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { message: "Error validating access token", code: 190 } }), { status: 401 })) as typeof fetch;
    const bad = await checkWhatsAppCredentials();
    assert.equal(bad.ok, false);
    assert.match(bad.message, /invalid or expired/);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  }
});
