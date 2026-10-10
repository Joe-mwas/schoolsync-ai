import { aiConfigured, briefData, generateReply, writeBrief } from "./ai.ts";
import { logAiExchange } from "./aiLog.ts";
import { splitMessage } from "./brief.ts";
import { mutateDb, newId, readDb } from "./db.ts";
import { MENU_HINT, routeMessage } from "./hub.ts";
import { phoneKey } from "./phone.ts";
import { isLeader, type User, type WhatsAppMessage } from "./types.ts";
import { applyStatusUpdates, normalizePhone, sendWhatsAppText, type StatusUpdate } from "./whatsapp.ts";

const UNKNOWN_SENDER_REPLY =
  "Hello! This number isn't registered with SchoolSync yet. Please contact the school office to link your phone number.";
const NO_AI_REPLY = "Thanks for your message. The school office will get back to you soon.";

/** Work out the reply (one or more WhatsApp messages) for someone we know. */
async function replyFor(user: User, text: string): Promise<string[]> {
  const db = await readDb();
  const action = routeMessage(db, user, text);
  const hint = isLeader(user.role) ? "Reply MENU for options." : MENU_HINT;

  if (action.type === "reply") return [action.text];

  if (action.type === "brief") {
    const data = briefData(db, action.period);
    const { text: brief, usedAi } = await writeBrief(db, data);
    await mutateDb((d) => {
      const me = d.users.find((u) => u.id === user.id);
      if (me) me.lastBriefAt = new Date().toISOString();
    });
    if (usedAi) await logAiExchange("brief", user.id, text, brief);
    return splitMessage(brief);
  }

  if (!aiConfigured()) return [`${NO_AI_REPLY}\n\n${hint}`];
  try {
    const answer = (await generateReply(user, db, text)) || NO_AI_REPLY;
    await logAiExchange("whatsapp", user.id, text, answer);
    return [`${answer}\n\n${hint}`];
  } catch (err) {
    console.error("WhatsApp AI reply failed", err);
    return [`${NO_AI_REPLY}\n\n${hint}`];
  }
}

/**
 * Handle a WhatsApp message: record it, work out the answer (menu, records,
 * brief or AI), send it, and record what was sent. Returns the last message sent.
 */
export async function handleInboundMessage(from: string, text: string): Promise<WhatsAppMessage> {
  const db = await readDb();
  // Meta sends international digits; the simulator may get a local number.
  const phone = phoneKey(from) || normalizePhone(from);
  const user = db.users.find((u) => u.phone && phoneKey(u.phone) === phone) ?? null;

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

  const replies = user ? await replyFor(user, text) : [UNKNOWN_SENDER_REPLY];

  let last: WhatsAppMessage | null = null;
  for (const body of replies) {
    const result = await sendWhatsAppText(phone, body);
    const outbound: WhatsAppMessage = {
      id: newId("wa"),
      direction: "outbound",
      phone,
      userId: user?.id ?? null,
      body,
      status: result.status,
      error: result.status === "failed" ? result.error : null,
      announcementId: null,
      createdAt: new Date().toISOString(),
      kind: "text",
      providerMessageId: result.status === "sent" ? result.messageId : null,
    };
    await mutateDb((d) => void d.whatsappMessages.push(outbound));
    last = outbound;
  }
  return last!;
}

/** Record delivery receipts from the webhook against logged messages. */
export async function handleStatusUpdates(updates: StatusUpdate[]): Promise<void> {
  if (updates.length === 0) return;
  await mutateDb((d) => void applyStatusUpdates(d.whatsappMessages, updates));
}
