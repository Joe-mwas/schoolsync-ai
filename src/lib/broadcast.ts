import { mutateDb, newId, readDb } from "./db.ts";
import { whatsappRecipients } from "./permissions.ts";
import type { WhatsAppMessage } from "./types.ts";
import { formatAnnouncementForWhatsApp, sendWhatsAppText } from "./whatsapp.ts";

export interface BroadcastSummary {
  recipients: number;
  sent: number;
  simulated: number;
  failed: number;
}

/** Send an announcement to every audience member with a phone number. */
export async function broadcastAnnouncement(announcementId: string): Promise<BroadcastSummary> {
  const db = await readDb();
  const a = db.announcements.find((x) => x.id === announcementId);
  if (!a) throw new Error("Announcement not found");

  const recipients = whatsappRecipients(a, db);
  const text = formatAnnouncementForWhatsApp(a);
  const results = await Promise.all(recipients.map((u) => sendWhatsAppText(u.phone!, text)));

  const log: WhatsAppMessage[] = results.map((r, i) => ({
    id: newId("wa"),
    direction: "outbound",
    phone: recipients[i].phone!,
    userId: recipients[i].id,
    body: text,
    status: r.status,
    error: r.status === "failed" ? r.error : null,
    announcementId: a.id,
    createdAt: new Date().toISOString(),
  }));

  await mutateDb((d) => {
    d.whatsappMessages.push(...log);
    const target = d.announcements.find((x) => x.id === a.id);
    if (target) target.whatsappSentAt = new Date().toISOString();
  });

  return {
    recipients: recipients.length,
    sent: results.filter((r) => r.status === "sent").length,
    simulated: results.filter((r) => r.status === "simulated").length,
    failed: results.filter((r) => r.status === "failed").length,
  };
}
