import { randomUUID } from "node:crypto";
import { testAiConnection } from "@/lib/ai";
import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { mutateDb, newId } from "@/lib/db";
import { checkDarajaCredentials, registerC2BUrls } from "@/lib/daraja";
import { canonicalPhone } from "@/lib/phone";
import { configuredPublicUrl } from "@/lib/publicUrl";
import { SELF_TEST_HEADER } from "@/lib/webhookActivity";
import { checkWhatsAppCredentials, normalizePhone, sendWhatsAppText, waEnv } from "@/lib/whatsapp";

type Result = { ok: boolean; message: string };

async function testWebhook(): Promise<Result> {
  const token = waEnv("WHATSAPP_VERIFY_TOKEN");
  if (!token) return { ok: false, message: "WHATSAPP_VERIFY_TOKEN isn't set, so Meta can't verify the webhook yet." };
  const publicUrl = configuredPublicUrl();
  const base = publicUrl ?? `http://127.0.0.1:${process.env.PORT || 3000}`;
  const challenge = randomUUID();
  const url = `${base}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(token)}&hub.challenge=${challenge}`;
  try {
    const res = await fetch(url, { headers: { [SELF_TEST_HEADER]: "1" }, redirect: "manual", signal: AbortSignal.timeout(10_000) });
    const body = await res.text();
    if (res.status === 200 && body === challenge) {
      return {
        ok: true,
        message: publicUrl
          ? `The public webhook at ${publicUrl}/api/whatsapp/webhook answers correctly. Meta's "Verify and save" will work with the same token.`
          : "The webhook answers correctly (checked inside the server; set PUBLIC_URL to also check the public address).",
      };
    }
    if (res.status >= 300 && res.status < 400) {
      return { ok: false, message: `The webhook redirects (HTTP ${res.status}); Meta doesn't follow redirects. Check the address has no trailing slash and uses https.` };
    }
    return { ok: false, message: `The webhook answered HTTP ${res.status}. Check the server logs for "WhatsApp webhook verification failed".` };
  } catch (err) {
    return { ok: false, message: `Couldn't reach the webhook: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function sendTest(phone: string, userId: string): Promise<Result> {
  const to = canonicalPhone(phone);
  if (!to) throw new HttpError(400, "Enter a phone number like +254712345678");
  const body = "✅ SchoolSync test message. If you can read this, WhatsApp is connected.";
  const result = await sendWhatsAppText(to, body);
  await mutateDb((db) =>
    void db.whatsappMessages.push({
      id: newId("wa"),
      direction: "outbound",
      phone: normalizePhone(to),
      userId,
      body,
      status: result.status,
      error: result.status === "failed" ? result.error : null,
      announcementId: null,
      createdAt: new Date().toISOString(),
      kind: "text",
      providerMessageId: result.status === "sent" ? result.messageId : null,
    }),
  );
  if (result.status === "simulated") return { ok: false, message: "WhatsApp isn't connected yet, so the message was only simulated (it's in the WhatsApp log)." };
  if (result.status === "failed") return { ok: false, message: `Meta rejected the message: ${result.error}` };
  return {
    ok: true,
    message: `Sent to ${to}. Meta accepted it; the WhatsApp page will show "delivered" when it arrives. If it never arrives, the number must message the school first (or, on the test number, be added under API Setup → To).`,
  };
}

export async function POST(req: Request) {
  try {
    const me = await requireApiUser(["admin"]);
    const { kind, phone } = (await req.json().catch(() => ({}))) as { kind?: string; phone?: string };
    let result: Result;
    switch (kind) {
      case "ai":
        result = await testAiConnection();
        break;
      case "whatsapp-credentials":
        result = await checkWhatsAppCredentials();
        break;
      case "webhook":
        result = await testWebhook();
        break;
      case "whatsapp-send":
        result = await sendTest(phone ?? "", me.id);
        break;
      case "mpesa-credentials":
        result = await checkDarajaCredentials();
        break;
      case "mpesa-register": {
        const publicUrl = configuredPublicUrl();
        result = publicUrl ? await registerC2BUrls(publicUrl) : { ok: false, message: "The site's public address isn't known (Render sets RENDER_EXTERNAL_URL; elsewhere set PUBLIC_URL)." };
        break;
      }
      default:
        throw new HttpError(400, "Unknown test");
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
