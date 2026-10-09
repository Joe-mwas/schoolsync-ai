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
