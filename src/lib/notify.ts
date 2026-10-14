import { lastInboundByPhone } from "./broadcast.ts";
import { mutateDb, newId, readDb } from "./db.ts";
import type { User, WhatsAppMessage } from "./types.ts";
import { chooseDelivery, normalizePhone, sendWhatsAppTemplate, sendWhatsAppText, templateConfig } from "./whatsapp.ts";

/**
 * Send one person a WhatsApp message the school starts (not a reply): free
 * text inside the 24-hour window, otherwise the approved template with
 * `title` and `text` as its two parameters. Logged like any other message.
 */
export async function notifyPerson(user: User, title: string, text: string, purpose: WhatsAppMessage["purpose"] = null): Promise<WhatsAppMessage | null> {
  if (!user.phone) return null;
  const db = await readDb();
  const phone = normalizePhone(user.phone);
  const template = templateConfig();
  const kind = chooseDelivery(lastInboundByPhone(db.whatsappMessages).get(phone) ?? null, template !== null);
  const result = kind === "template" ? await sendWhatsAppTemplate(phone, template!, [title, text]) : await sendWhatsAppText(phone, text);
  const msg: WhatsAppMessage = {
    id: newId("wa"),
    direction: "outbound",
    phone,
    userId: user.id,
    body: text,
    status: result.status,
    error: result.status === "failed" ? result.error : null,
    announcementId: null,
    createdAt: new Date().toISOString(),
    kind,
    providerMessageId: result.status === "sent" ? result.messageId : null,
    ...(purpose ? { purpose } : {}),
  };
  await mutateDb((d) => void d.whatsappMessages.push(msg));
  return msg;
}
