import assert from "node:assert/strict";
import { test } from "node:test";
import type { WhatsAppMessage } from "../src/lib/types.ts";
import {
  applyStatusUpdates,
  buildTemplatePayload,
  chooseDelivery,
  parseStatusUpdates,
  sanitizeTemplateParam,
  templateConfig,
} from "../src/lib/whatsapp.ts";

const HOUR = 60 * 60 * 1000;
const now = Date.parse("2026-10-09T12:00:00Z");
const ago = (h: number) => new Date(now - h * HOUR).toISOString();

test("template config comes from env, defaulting to English", () => {
  assert.equal(templateConfig({}), null);
  assert.deepEqual(templateConfig({ WHATSAPP_TEMPLATE_NAME: "school_announcement" }), { name: "school_announcement", language: "en" });
  assert.deepEqual(templateConfig({ WHATSAPP_TEMPLATE_NAME: "x", WHATSAPP_TEMPLATE_LANGUAGE: "sw" }), { name: "x", language: "sw" });
});

test("uses free text inside the 24h window and the template outside it", () => {
  assert.equal(chooseDelivery(ago(2), true, now), "text");
  assert.equal(chooseDelivery(ago(25), true, now), "template");
  assert.equal(chooseDelivery(null, true, now), "template");
  // Without a template there is nothing better than text.
  assert.equal(chooseDelivery(null, false, now), "text");
});

test("template params are flattened to what Meta accepts", () => {
  assert.equal(sanitizeTemplateParam("Line one\n\n  Line two\tand     more"), "Line one · Line two and more");
  const long = sanitizeTemplateParam("a".repeat(2000), 10);
  assert.equal(long.length, 10);
  assert.ok(long.endsWith("…"));
});

test("builds a Cloud API template payload", () => {
  const payload = buildTemplatePayload("+254 700 000 001", { name: "school_announcement", language: "en" }, ["Trip", "Bring\nlunch", ""]);
  assert.deepEqual(payload, {
    messaging_product: "whatsapp",
    to: "254700000001",
    type: "template",
    template: {
      name: "school_announcement",
      language: { code: "en" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: "Trip" },
            { type: "text", text: "Bring · lunch" },
            { type: "text", text: "-" },
          ],
        },
      ],
    },
  });
});

test("parses delivery receipts and never moves a status backwards", () => {
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              statuses: [
                { id: "wamid.A", status: "read" },
                { id: "wamid.A", status: "delivered" },
                { id: "wamid.B", status: "failed", errors: [{ code: 131047, title: "Re-engagement message" }] },
                { id: "wamid.B", status: "read" },
                { id: "wamid.C", status: "deleted" },
              ],
            },
          },
        ],
      },
    ],
  };
  const updates = parseStatusUpdates(payload);
  assert.equal(updates.length, 4);

  const msg = (id: string): WhatsAppMessage => ({
    id,
    direction: "outbound",
    phone: "1",
    userId: null,
    body: "",
    status: "sent",
    error: null,
    announcementId: null,
    createdAt: ago(0),
    providerMessageId: id,
  });
  const messages = [msg("wamid.A"), msg("wamid.B"), { ...msg("x"), providerMessageId: null }];
  assert.equal(applyStatusUpdates(messages, updates), 2);
  assert.equal(messages[0].status, "read");
  assert.equal(messages[1].status, "failed");
  assert.equal(messages[1].error, "131047 Re-engagement message");
  assert.equal(messages[2].status, "sent");
});
