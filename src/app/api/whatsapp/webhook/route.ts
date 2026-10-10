import { after } from "next/server";
import { handleInboundMessage, handleStatusUpdates } from "@/lib/inbound";
import {
  checkWebhookVerification,
  parseIncomingMessages,
  parseStatusUpdates,
  verifyWebhookSignature,
  waEnv,
} from "@/lib/whatsapp";

/** Meta's webhook verification handshake. */
export async function GET(req: Request) {
  const result = checkWebhookVerification(new URL(req.url).searchParams);
  if (result.ok) return new Response(result.challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  console.warn(`WhatsApp webhook verification failed: ${result.reason}`);
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = waEnv("WHATSAPP_APP_SECRET");
  if (secret) {
    if (!verifyWebhookSignature(raw, req.headers.get("x-hub-signature-256"), secret)) {
      console.warn("WhatsApp webhook rejected: signature doesn't match WHATSAPP_APP_SECRET (check it's the App secret from App settings → Basic)");
      return new Response("Invalid signature", { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.warn("WhatsApp webhook rejected: WHATSAPP_APP_SECRET is not set on the server");
    return new Response("WHATSAPP_APP_SECRET is not configured", { status: 500 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  // Acknowledge immediately; Meta retries webhooks that respond slowly.
  const messages = parseIncomingMessages(payload);
  const statuses = parseStatusUpdates(payload);
  after(async () => {
    await handleStatusUpdates(statuses).catch((err) => console.error("status update failed", err));
    for (const m of messages) {
      await handleInboundMessage(m.from, m.body).catch((err) => console.error("inbound failed", err));
    }
  });
  return new Response("OK", { status: 200 });
}
