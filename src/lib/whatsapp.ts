import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * WhatsApp Cloud API (Meta) client. When credentials are not configured the
 * app runs in simulation mode: messages are recorded but not sent.
 *
 * Note: Meta only allows free-form text inside the 24-hour customer service
 * window. Broadcasts to parents who haven't messaged recently need an approved
 * message template; see README for details.
 */

const GRAPH_VERSION = "v21.0";

export function whatsappConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

/** Normalise to the digits-only international format the Cloud API uses. */
export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

export type SendResult = { status: "sent" | "simulated" } | { status: "failed"; error: string };

export async function sendWhatsAppText(to: string, body: string): Promise<SendResult> {
  if (!whatsappConfigured()) return { status: "simulated" };
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: normalizePhone(to),
          type: "text",
          text: { body, preview_url: false },
        }),
      },
    );
    if (!res.ok) {
      const detail = await res.text();
      return { status: "failed", error: `HTTP ${res.status}: ${detail.slice(0, 300)}` };
    }
    return { status: "sent" };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
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

export function formatAnnouncementForWhatsApp(a: { title: string; body: string; priority: string }, schoolName = "SchoolSync"): string {
  const prefix = a.priority === "urgent" ? "🚨 URGENT — " : "📢 ";
  return `${prefix}${a.title}\n\n${a.body}\n\n— ${schoolName}`;
}
