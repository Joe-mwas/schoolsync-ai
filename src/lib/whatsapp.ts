import { createHmac, timingSafeEqual } from "node:crypto";
import type { WhatsAppMessage } from "./types.ts";

/**
 * WhatsApp Cloud API (Meta) client. When credentials are not configured the
 * app runs in simulation mode: messages are recorded but not sent.
 *
 * Meta only allows free-form text inside the 24-hour customer service window;
 * outside it, announcements go out as an approved message template.
 */

const GRAPH_VERSION = "v21.0";

/**
 * WhatsApp settings, trimmed: values pasted into a hosting dashboard often
 * pick up a stray space or newline, which would otherwise fail silently.
 */
export function waEnv(
  name: "WHATSAPP_TOKEN" | "WHATSAPP_PHONE_NUMBER_ID" | "WHATSAPP_VERIFY_TOKEN" | "WHATSAPP_APP_SECRET",
  env: Record<string, string | undefined> = process.env,
): string {
  return env[name]?.trim() ?? "";
}

export function whatsappConfigured(): boolean {
  return Boolean(waEnv("WHATSAPP_TOKEN") && waEnv("WHATSAPP_PHONE_NUMBER_ID"));
}

export type VerifyResult = { ok: true; challenge: string } | { ok: false; reason: string };

/**
 * Meta's webhook verification handshake. On failure, `reason` says why in
 * terms safe to log (it never includes either token).
 */
export function checkWebhookVerification(params: URLSearchParams, env: Record<string, string | undefined> = process.env): VerifyResult {
  const expected = waEnv("WHATSAPP_VERIFY_TOKEN", env);
  const mode = params.get("hub.mode");
  const given = params.get("hub.verify_token")?.trim() ?? "";
  const challenge = params.get("hub.challenge") ?? "";
  if (!expected) return { ok: false, reason: "WHATSAPP_VERIFY_TOKEN is not set on the server (add it and redeploy)" };
  if (mode !== "subscribe") return { ok: false, reason: `hub.mode is "${mode ?? ""}", expected "subscribe"` };
  if (!given) return { ok: false, reason: "the request had no hub.verify_token" };
  if (!challenge) return { ok: false, reason: "the request had no hub.challenge" };
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return {
      ok: false,
      reason: `the verify token doesn't match WHATSAPP_VERIFY_TOKEN (server's is ${a.length} characters, received ${b.length}); retype it in both places`,
    };
  }
  return { ok: true, challenge };
}

/** Normalise to the digits-only international format the Cloud API uses. */
export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

export type SendResult =
  | { status: "sent"; messageId: string | null }
  | { status: "simulated" }
  | { status: "failed"; error: string };

/** Meta only allows free-form messages within 24h of the recipient's last message. */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface TemplateConfig {
  name: string;
  language: string;
}

/**
 * The approved template used for announcements outside the service window.
 * Its body must take two variables: {{1}} = title, {{2}} = message.
 */
export function templateConfig(env: Record<string, string | undefined> = process.env): TemplateConfig | null {
  const name = env.WHATSAPP_TEMPLATE_NAME?.trim();
  if (!name) return null;
  return { name, language: env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "en" };
}

export function withinServiceWindow(lastInboundAt: string | null, now = Date.now()): boolean {
  return lastInboundAt !== null && now - Date.parse(lastInboundAt) < SERVICE_WINDOW_MS;
}

export type DeliveryKind = "text" | "template";

/**
 * Free text inside the service window (it's free and keeps formatting);
 * otherwise the approved template when one is configured. Without a template,
 * fall back to text, which Meta will likely refuse to deliver.
 */
export function chooseDelivery(lastInboundAt: string | null, hasTemplate: boolean, now = Date.now()): DeliveryKind {
  return !withinServiceWindow(lastInboundAt, now) && hasTemplate ? "template" : "text";
}

/**
 * Template variables may not contain newlines, tabs or more than four
 * consecutive spaces, so flatten them and cap the length.
 */
export function sanitizeTemplateParam(text: string, maxLength = 900): string {
  const flat = text
    .replace(/\s*\n+\s*/g, " · ")
    .replace(/\t/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
  return flat.length > maxLength ? `${flat.slice(0, maxLength - 1).trimEnd()}…` : flat;
}

export function buildTemplatePayload(to: string, template: TemplateConfig, params: string[]) {
  return {
    messaging_product: "whatsapp",
    to: normalizePhone(to),
    type: "template",
    template: {
      name: template.name,
      language: { code: template.language },
      components: [
        {
          type: "body",
          parameters: params.map((p) => ({ type: "text", text: sanitizeTemplateParam(p) || "-" })),
        },
      ],
    },
  };
}

async function postMessage(payload: unknown): Promise<SendResult> {
  if (!whatsappConfigured()) return { status: "simulated" };
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${waEnv("WHATSAPP_PHONE_NUMBER_ID")}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${waEnv("WHATSAPP_TOKEN")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      const detail = await res.text();
      return { status: "failed", error: `HTTP ${res.status}: ${detail.slice(0, 300)}` };
    }
    const data = (await res.json().catch(() => null)) as { messages?: { id?: string }[] } | null;
    return { status: "sent", messageId: data?.messages?.[0]?.id ?? null };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

export interface CredentialCheck {
  ok: boolean;
  message: string;
}

/**
 * Ask Meta about the configured phone number. Confirms the token and phone
 * number ID work together, without sending anything.
 */
export async function checkWhatsAppCredentials(): Promise<CredentialCheck> {
  if (!whatsappConfigured()) {
    return { ok: false, message: "WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID must both be set." };
  }
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(waEnv("WHATSAPP_PHONE_NUMBER_ID"))}?fields=display_phone_number,verified_name,quality_rating`,
      { headers: { Authorization: `Bearer ${waEnv("WHATSAPP_TOKEN")}` }, signal: AbortSignal.timeout(10_000) },
    );
    const data = (await res.json().catch(() => ({}))) as {
      display_phone_number?: string;
      verified_name?: string;
      quality_rating?: string;
      error?: { message?: string; code?: number };
    };
    if (!res.ok) {
      const code = data.error?.code;
      const hint =
        code === 190
          ? "The access token is invalid or expired. Generate a permanent System User token (expiry: Never)."
          : code === 100
            ? "The phone number ID wasn't found for this token. Copy it again from WhatsApp → API Setup."
            : "Check the token and phone number ID.";
      return { ok: false, message: `Meta said: ${data.error?.message ?? `HTTP ${res.status}`}. ${hint}` };
    }
    const quality = data.quality_rating ? `, quality ${data.quality_rating}` : "";
    return { ok: true, message: `Connected to ${data.display_phone_number ?? "the number"} (${data.verified_name ?? "unnamed"}${quality}).` };
  } catch (err) {
    return { ok: false, message: `Couldn't reach Meta: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export function sendWhatsAppText(to: string, body: string): Promise<SendResult> {
  return postMessage({
    messaging_product: "whatsapp",
    to: normalizePhone(to),
    type: "text",
    text: { body, preview_url: false },
  });
}

/** WhatsApp captions are limited to 1024 characters. */
export function buildImagePayload(to: string, mediaId: string, caption: string) {
  return {
    messaging_product: "whatsapp",
    to: normalizePhone(to),
    type: "image",
    image: { id: mediaId, ...(caption.trim() ? { caption: caption.trim().slice(0, 1024) } : {}) },
  };
}

/** Upload the picture to Meta, then send it with a caption. */
export async function sendWhatsAppImage(to: string, bytes: Uint8Array, type: string, caption: string): Promise<SendResult> {
  if (!whatsappConfigured()) return { status: "simulated" };
  try {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", type);
    form.append("file", new Blob([new Uint8Array(bytes)], { type }), type === "image/png" ? "picture.png" : "picture.jpg");
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${waEnv("WHATSAPP_PHONE_NUMBER_ID")}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${waEnv("WHATSAPP_TOKEN")}` },
      body: form,
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!res.ok || !data.id) return { status: "failed", error: `Picture upload failed: ${data.error?.message ?? `HTTP ${res.status}`}` };
    return postMessage(buildImagePayload(to, data.id, caption));
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

export function sendWhatsAppTemplate(to: string, template: TemplateConfig, params: string[]): Promise<SendResult> {
  return postMessage(buildTemplatePayload(to, template, params));
}

/** Verify Meta's X-Hub-Signature-256 header against the raw request body. */
export function verifyWebhookSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", appSecret).update(rawBody).digest("hex"));
  const actual = Buffer.from(header.slice("sha256=".length));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export interface IncomingText {
  from: string;
  body: string;
}

/** Extract inbound text messages from a Cloud API webhook payload. */
export function parseIncomingMessages(payload: unknown): IncomingText[] {
  const out: IncomingText[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry ?? [];
  for (const entry of entries as { changes?: { value?: { messages?: unknown[] } }[] }[]) {
    for (const change of entry.changes ?? []) {
      for (const m of (change.value?.messages ?? []) as { from?: string; type?: string; text?: { body?: string } }[]) {
        if (m.type === "text" && m.from && m.text?.body) out.push({ from: m.from, body: m.text.body });
      }
    }
  }
  return out;
}

export interface StatusUpdate {
  messageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  error: string | null;
}

/** Extract delivery receipts (sent / delivered / read / failed) from a webhook payload. */
export function parseStatusUpdates(payload: unknown): StatusUpdate[] {
  const out: StatusUpdate[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry ?? [];
  for (const entry of entries as { changes?: { value?: { statuses?: unknown[] } }[] }[]) {
    for (const change of entry.changes ?? []) {
      for (const st of (change.value?.statuses ?? []) as {
        id?: string;
        status?: string;
        errors?: { code?: number; title?: string; message?: string }[];
      }[]) {
        if (!st.id || !["sent", "delivered", "read", "failed"].includes(st.status ?? "")) continue;
        const err = st.errors?.[0];
        out.push({
          messageId: st.id,
          status: st.status as StatusUpdate["status"],
          error: err ? `${err.code ?? ""} ${err.title ?? err.message ?? ""}`.trim() : null,
        });
      }
    }
  }
  return out;
}

const STATUS_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 };

/**
 * Apply delivery receipts to logged messages. Receipts can arrive out of
 * order, so a status never moves backwards (read stays read), while a
 * failure always wins. Returns how many messages changed.
 */
export function applyStatusUpdates(messages: WhatsAppMessage[], updates: StatusUpdate[]): number {
  const byId = new Map(messages.filter((m) => m.providerMessageId).map((m) => [m.providerMessageId!, m]));
  let changed = 0;
  for (const u of updates) {
    const m = byId.get(u.messageId);
    if (!m || m.status === "failed") continue;
    if (u.status === "failed") {
      m.status = "failed";
      m.error = u.error ?? "Delivery failed";
      changed++;
    } else if ((STATUS_RANK[u.status] ?? 0) > (STATUS_RANK[m.status] ?? 0)) {
      m.status = u.status;
      changed++;
    }
  }
  return changed;
}

export function formatAnnouncementForWhatsApp(a: { title: string; body: string; priority: string }, schoolName = "SchoolSync"): string {
  const prefix = a.priority === "urgent" ? "🚨 URGENT — " : "📢 ";
  return `${prefix}${a.title}\n\n${a.body}\n\n— ${schoolName}`;
}
