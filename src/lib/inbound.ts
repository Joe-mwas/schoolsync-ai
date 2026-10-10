import { aiConfigured, generateReply } from "./ai.ts";
import { mutateDb, newId, readDb } from "./db.ts";
import type { WhatsAppMessage } from "./types.ts";
import { applyStatusUpdates, normalizePhone, sendWhatsAppText, type StatusUpdate } from "./whatsapp.ts";

const UNKNOWN_SENDER_REPLY =
  "Hello! This number isn't registered with SchoolSync yet. Please contact the school office to link your phone number.";
const NO_AI_REPLY = "Thanks for your message. The school office will get back to you soon.";

/** Record an inbound WhatsApp message and reply via the AI assistant. */
export async function handleInboundMessage(from: string, text: string): Promise<WhatsAppMessage> {
  const db = await readDb();
  const phone = normalizePhone(from);
  const user = db.users.find((u) => u.phone && normalizePhone(u.phone) === phone) ?? null;

  const inbound: WhatsAppMessage = {
    id: newId("wa"),
    direction: "inbound",
    phone,
    userId: user?.id ?? null,
    body: text,
    status: "received",
    error: null,
    announcementId: null,
    createdAt: new Date().toISOString(),
  };
  await mutateDb((d) => void d.whatsappMessages.push(inbound));

  let reply: string;
  if (!user) {
    reply = UNKNOWN_SENDER_REPLY;
  } else if (!aiConfigured()) {
    reply = NO_AI_REPLY;
  } else {
    try {
      reply = (await generateReply(user, db, text)) || NO_AI_REPLY;
    } catch (err) {
      console.error("WhatsApp AI reply failed", err);
      reply = NO_AI_REPLY;
    }
  }

  const result = await sendWhatsAppText(phone, reply);
  const outbound: WhatsAppMessage = {
    id: newId("wa"),
    direction: "outbound",
    phone,
    userId: user?.id ?? null,
    body: reply,
    status: result.status,
    error: result.status === "failed" ? result.error : null,
    announcementId: null,
    createdAt: new Date().toISOString(),
    kind: "text",
    providerMessageId: result.status === "sent" ? result.messageId : null,
  };
  await mutateDb((d) => void d.whatsappMessages.push(outbound));
  return outbound;
}

/** Record delivery receipts from the webhook against logged messages. */
export async function handleStatusUpdates(updates: StatusUpdate[]): Promise<void> {
  if (updates.length === 0) return;
  await mutateDb((d) => void applyStatusUpdates(d.whatsappMessages, updates));
}
