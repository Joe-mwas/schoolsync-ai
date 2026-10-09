import { after } from "next/server";
import { handleInboundMessage } from "@/lib/inbound";
import { parseIncomingMessages, verifyWebhookSignature } from "@/lib/whatsapp";

/** Meta's webhook verification handshake. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (secret) {
    if (!verifyWebhookSignature(raw, req.headers.get("x-hub-signature-256"), secret)) {
      return new Response("Invalid signature", { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
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
  after(async () => {
    for (const m of messages) {
      await handleInboundMessage(m.from, m.body).catch((err) => console.error("inbound failed", err));
    }
  });
  return new Response("OK", { status: 200 });
}
