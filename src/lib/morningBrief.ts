import { briefData, writeBrief } from "./ai.ts";
import { parseBriefPeriod, splitMessage } from "./brief.ts";
import { lastInboundByPhone } from "./broadcast.ts";
import { mutateDb, newId, readDb } from "./db.ts";
import { LATEST_MINUTE, morningBriefConfig, nairobiClock, type MorningBriefConfig } from "./morningBriefConfig.ts";
import type { Database, User, WhatsAppMessage } from "./types.ts";
import { normalizePhone, sendWhatsAppTemplate, sendWhatsAppText, templateConfig, withinServiceWindow, type SendResult } from "./whatsapp.ts";

/** The director's morning brief, sent to their WhatsApp automatically (see morningBriefConfig.ts). */

export { morningBriefConfig, nairobiClock };

type Env = Record<string, string | undefined>;

/** The director and headteacher, if they should get this morning's brief now. */
export function dueForMorningBrief(db: Pick<Database, "users">, cfg: MorningBriefConfig | null, now = Date.now()): User[] {
  if (!cfg) return [];
  const clock = nairobiClock(now);
  if (cfg.weekdaysOnly && (clock.weekday === 0 || clock.weekday === 6)) return [];
  if (clock.minute < cfg.minute || clock.minute >= LATEST_MINUTE) return [];
  return db.users.filter((u) => (u.role === "director" || u.role === "headteacher") && u.phone && u.morningBriefDate !== clock.date);
}

function logged(user: User, phone: string, body: string, r: SendResult, kind: "text" | "template"): WhatsAppMessage {
  return {
    id: newId("wa"),
    direction: "outbound",
    phone,
    userId: user.id,
    body,
    status: r.status,
    error: r.status === "failed" ? r.error : null,
    announcementId: null,
    createdAt: new Date().toISOString(),
    kind,
    providerMessageId: r.status === "sent" ? r.messageId : null,
    purpose: "morning-brief",
  };
}

/**
 * Send one director their brief. Inside WhatsApp's 24-hour window the full
 * brief goes as text; outside it, the approved template asks them to reply
 * BRIEF (the reply opens the window and the brief follows), because a
 * template can't carry the whole brief.
 */
async function sendTo(directorId: string, date: string): Promise<void> {
  // Claim today's brief first, so two ticks never send it twice.
  const director = await mutateDb((db) => {
    const u = db.users.find((x) => x.id === directorId);
    if (!u || !u.phone || u.morningBriefDate === date) return null;
    u.morningBriefDate = date;
    return { ...u };
  });
  if (!director) return;
  const db = await readDb();
  const phone = normalizePhone(director.phone!);
  const inWindow = withinServiceWindow(lastInboundByPhone(db.whatsappMessages).get(phone) ?? null);
  const template = templateConfig();
  const messages: WhatsAppMessage[] = [];

  if (!inWindow && template) {
    const body = `Good morning ${director.name.split(" ")[0]}! Your SchoolSync brief for today is ready. Reply BRIEF to read it.`;
    messages.push(logged(director, phone, body, await sendWhatsAppTemplate(phone, template, ["Morning brief", body]), "template"));
  } else {
    const period = parseBriefPeriod("", director.lastBriefAt ?? new Date(Date.now() - 86_400_000).toISOString());
    const { text } = await writeBrief(db, briefData(db, period));
    for (const part of splitMessage(`☀️ Good morning! ${text}`)) messages.push(logged(director, phone, part, await sendWhatsAppText(phone, part), "text"));
  }
  await mutateDb((d) => {
    d.whatsappMessages.push(...messages);
    const u = d.users.find((x) => x.id === directorId);
    if (u && messages.some((m) => m.kind === "text" && m.status !== "failed")) u.lastBriefAt = new Date().toISOString();
  });
  console.log(`Morning brief for ${director.name}: ${messages.map((m) => `${m.kind}/${m.status}`).join(", ")}`);
}

/** Called every few minutes by the scheduler. */
export async function morningBriefTick(now = Date.now(), env: Env = process.env): Promise<number> {
  const due = dueForMorningBrief(await readDb(), morningBriefConfig(env), now);
  const date = nairobiClock(now).date;
  for (const d of due) await sendTo(d.id, date).catch((err) => console.error(`Morning brief for ${d.name} failed`, err));
  return due.length;
}
