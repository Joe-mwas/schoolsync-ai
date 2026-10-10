import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { normalizePhone, parseIncomingMessages, sendWhatsAppText, verifyWebhookSignature } from "../src/lib/whatsapp.ts";
import { wrapText } from "../src/lib/poster.ts";

test("normalizes phone numbers to digits", () => {
  assert.equal(normalizePhone("+254 700-000 001"), "254700000001");
});

test("parses text messages out of a Cloud API webhook payload", () => {
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                { from: "254700000004", type: "text", text: { body: "Hello" } },
                { from: "254700000004", type: "image", image: {} },
              ],
              statuses: [{ id: "x" }],
            },
          },
        ],
      },
    ],
  };
  assert.deepEqual(parseIncomingMessages(payload), [{ from: "254700000004", body: "Hello" }]);
  assert.deepEqual(parseIncomingMessages({}), []);
  assert.deepEqual(parseIncomingMessages(null), []);
});

test("verifies webhook signatures", () => {
  const body = '{"a":1}';
  const sig = "sha256=" + createHmac("sha256", "secret").update(body).digest("hex");
  assert.equal(verifyWebhookSignature(body, sig, "secret"), true);
  assert.equal(verifyWebhookSignature(body + " ", sig, "secret"), false);
  assert.equal(verifyWebhookSignature(body, null, "secret"), false);
  assert.equal(verifyWebhookSignature(body, "sha256=abc", "secret"), false);
});

test("simulates sends when WhatsApp isn't configured", async () => {
  delete process.env.WHATSAPP_TOKEN;
  assert.deepEqual(await sendWhatsAppText("+254700000001", "hi"), { status: "simulated" });
});

test("wraps poster text by measured width", () => {
  const measure = (s: string) => s.length;
  assert.deepEqual(wrapText(measure, "one two three four", 9), ["one two", "three", "four"]);
  assert.deepEqual(wrapText(measure, "a\nb", 10), ["a", "b"]);
  assert.deepEqual(wrapText(measure, "supercalifragilistic", 5), ["supercalifragilistic"]);
});

test("webhook verification tolerates stray spaces and explains failures", async () => {
  const { checkWebhookVerification, waEnv } = await import("../src/lib/whatsapp.ts");
  const q = (s: string) => new URLSearchParams(s);
  const ok = "hub.mode=subscribe&hub.verify_token=schoolsync8274&hub.challenge=12345";

  // Pasted with a trailing newline/space in the dashboard, or in Meta's form.
  assert.deepEqual(checkWebhookVerification(q(ok), { WHATSAPP_VERIFY_TOKEN: " schoolsync8274\n" }), { ok: true, challenge: "12345" });
  assert.deepEqual(
    checkWebhookVerification(q("hub.mode=subscribe&hub.verify_token=%20schoolsync8274%20&hub.challenge=9"), { WHATSAPP_VERIFY_TOKEN: "schoolsync8274" }),
    { ok: true, challenge: "9" },
  );

  const reason = (params: string, env: Record<string, string | undefined>) => {
    const r = checkWebhookVerification(q(params), env);
    assert.equal(r.ok, false);
    return (r as { reason: string }).reason;
  };
  assert.match(reason(ok, {}), /not set/);
  assert.match(reason(ok, { WHATSAPP_VERIFY_TOKEN: "   " }), /not set/);
  assert.match(reason("hub.verify_token=schoolsync8274&hub.challenge=1", { WHATSAPP_VERIFY_TOKEN: "schoolsync8274" }), /hub.mode/);
  assert.match(reason("hub.mode=subscribe&hub.challenge=1", { WHATSAPP_VERIFY_TOKEN: "schoolsync8274" }), /no hub.verify_token/);
  const mismatch = reason(ok, { WHATSAPP_VERIFY_TOKEN: "schoolsync-8274" });
  assert.match(mismatch, /doesn't match.*15 characters, received 14/);
  assert.ok(!mismatch.includes("schoolsync"), "never logs the tokens");

  assert.equal(waEnv("WHATSAPP_TOKEN", { WHATSAPP_TOKEN: "abc \n" }), "abc");
  assert.equal(waEnv("WHATSAPP_TOKEN", {}), "");
});
