import { mutateDb, newId, readDb } from "./db.ts";
import { whatsappRecipients } from "./permissions.ts";
import type { WhatsAppMessage } from "./types.ts";
import {
  chooseDelivery,
  formatAnnouncementForWhatsApp,
  normalizePhone,
  sendWhatsAppTemplate,
  sendWhatsAppText,
  templateConfig,
  withinServiceWindow,
} from "./whatsapp.ts";

export interface BroadcastSummary {
  recipients: number;
  sent: number;
  simulated: number;
  failed: number;
  /** Recipients reached through the approved template (outside the 24h window). */
  viaTemplate: number;
  /** Recipients outside the 24h window with no template configured: likely undelivered. */
  outsideWindow: number;
}

/** Most recent inbound message time per normalized phone number. */
function lastInboundByPhone(messages: WhatsAppMessage[]): Map<string, string> {
  const last = new Map<string, string>();
  for (const m of messages) {
    if (m.direction !== "inbound") continue;
    const phone = normalizePhone(m.phone);
    const prev = last.get(phone);
    if (!prev || m.createdAt > prev) last.set(phone, m.createdAt);
  }
  return last;
}

/** Send an announcement to every audience member with a phone number. */
export async function broadcastAnnouncement(announcementId: string): Promise<BroadcastSummary> {
  const db = await readDb();
  const a = db.announcements.find((x) => x.id === announcementId);
  if (!a) throw new Error("Announcement not found");

  const recipients = whatsappRecipients(a, db);
  const text = formatAnnouncementForWhatsApp(a);
  const template = templateConfig();
  const lastInbound = lastInboundByPhone(db.whatsappMessages);
  const title = a.priority === "urgent" ? `URGENT: ${a.title}` : a.title;

  const plans = recipients.map((u) => {
    const last = lastInbound.get(normalizePhone(u.phone!)) ?? null;
    return { user: u, inWindow: withinServiceWindow(last), kind: chooseDelivery(last, template !== null) };
  });
  const results = await Promise.all(
    plans.map(({ user, kind }) =>
      kind === "template" ? sendWhatsAppTemplate(user.phone!, template!, [title, a.body]) : sendWhatsAppText(user.phone!, text),
    ),
  );

  const now = new Date().toISOString();
  const log: WhatsAppMessage[] = results.map((r, i) => ({
    id: newId("wa"),
    direction: "outbound",
    phone: normalizePhone(plans[i].user.phone!),
    userId: plans[i].user.id,
    body: text,
    status: r.status,
    error: r.status === "failed" ? r.error : null,
    announcementId: a.id,
    createdAt: now,
    kind: plans[i].kind,
    providerMessageId: r.status === "sent" ? r.messageId : null,
  }));

  await mutateDb((d) => {
    d.whatsappMessages.push(...log);
    const target = d.announcements.find((x) => x.id === a.id);
    if (target) target.whatsappSentAt = now;
  });

  return {
    recipients: recipients.length,
    sent: results.filter((r) => r.status === "sent").length,
    simulated: results.filter((r) => r.status === "simulated").length,
    failed: results.filter((r) => r.status === "failed").length,
    viaTemplate: plans.filter((p) => p.kind === "template").length,
    outsideWindow: plans.filter((p) => !p.inWindow && p.kind === "text").length,
  };
}
