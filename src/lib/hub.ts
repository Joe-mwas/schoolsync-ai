import { parseBriefPeriod, type BriefPeriod } from "./brief.ts";
import { pictureRequest } from "./facts.ts";
import { feeStatement, formatFeeStatement } from "./fees.ts";
import { examPerformance, examsFor, formatReport, studentReport } from "./results.ts";
import { isLeader, type Database, type SchoolFact, type User } from "./types.ts";

/**
 * WhatsApp is the main way families and staff reach the school. Menu choices
 * and keywords are answered straight from the records (instant, free, and
 * working even without the AI); anything else is a question for the AI.
 */
export type HubAction =
  | { type: "reply"; text: string }
  | { type: "ai" }
  | { type: "brief"; period: BriefPeriod }
  | { type: "picture"; fact: SchoolFact };

const GREETINGS = /^(hi+|hello|hey|menu|help|start|options|0|habari|jambo|mambo|hujambo|sasa|niaje)\b[!.?\s]*$/i;
const first = (u: User) => u.name.split(" ")[0];

export function menuText(user: User): string {
  if (isLeader(user.role)) {
    return [
      `👋 Hello ${first(user)}! Reply with a number:`,
      "1️⃣ Brief since your last one",
      "2️⃣ Brief for today",
      "3️⃣ Brief for this week",
      "4️⃣ Brief for this month",
      "5️⃣ Upcoming events",
      'Or type "brief" any time, or ask me anything.',
    ].join("\n");
  }
  const lines = [`👋 Hello ${first(user)}! Reply with a number:`];
  if (user.role === "parent") lines.push("1️⃣ Results", "2️⃣ Fee balance");
  if (user.role === "student") lines.push("1️⃣ My results");
  if (user.role === "teacher") lines.push("1️⃣ My classes' latest results");
  lines.push("3️⃣ Upcoming events", "4️⃣ Ask a question", "Or just type your question any time.");
  return lines.join("\n");
}

export const MENU_HINT = "Reply MENU for results, fee balance and events.";

function events(db: Database, now: number): string {
  const today = new Date(now).toISOString().slice(0, 10);
  const next = db.events.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  if (next.length === 0) return "📅 No upcoming events at the moment.";
  return ["📅 Upcoming events", ...next.map((e) => `• ${e.date}: ${e.title}${e.description ? ` — ${e.description}` : ""}`)].join("\n");
}

function children(db: Database, user: User): User[] {
  return db.users.filter((u) => user.childIds.includes(u.id) && u.role === "student");
}

function results(db: Database, user: User): string {
  if (user.role === "parent") {
    const kids = children(db, user);
    if (kids.length === 0) return "No learners are linked to your number yet. Please contact the school office.";
    return kids.map((k) => formatReport(k.name, studentReport(db, k.id))).join("\n\n");
  }
  if (user.role === "student") return formatReport(user.name, studentReport(db, user.id));
  if (user.role === "teacher") {
    const parts: string[] = [];
    for (const cls of db.classes.filter((c) => user.classIds.includes(c.id))) {
      const ids = db.users.filter((u) => u.role === "student" && u.classIds.includes(cls.id)).map((u) => u.id);
      const exam = examsFor(db, ids)[0];
      const p = exam ? examPerformance(db, exam).find((x) => x.classId === cls.id) : undefined;
      parts.push(
        p
          ? `📘 ${cls.name} — ${exam}\nEE ${p.counts.EE}, ME ${p.counts.ME}, AE ${p.counts.AE}, BE ${p.counts.BE}\nWeakest area: ${p.weakestArea ?? "–"}${p.needingSupport.length ? `\nNeeding support: ${p.needingSupport.join(", ")}` : ""}`
          : `📘 ${cls.name}: no results recorded yet.`,
      );
    }
    return parts.join("\n\n") || "You don't have any classes yet.";
  }
  return "Results are available to parents, learners and teachers.";
}

function fees(db: Database, user: User): string {
  if (user.role !== "parent") return "Fee balances are shared with parents. Please contact the school office.";
  const kids = children(db, user);
  if (kids.length === 0) return "No learners are linked to your number yet. Please contact the school office.";
  return kids.map((k) => formatFeeStatement(k.name, feeStatement(db, k.id))).join("\n\n");
}

export function routeMessage(db: Database, user: User, text: string, now = Date.now()): HubAction {
  const t = text.trim();
  const lower = t.toLowerCase();
  const reply = (s: string): HubAction => ({ type: "reply", text: s });
  if (GREETINGS.test(t)) return reply(menuText(user));
  // "Send a picture of the uniform": the school's own picture, no AI needed.
  const picture = pictureRequest(db, user, t);
  if (picture) return { type: "picture", fact: picture };

  if (isLeader(user.role)) {
    const periods: Record<string, string> = { "1": "", "2": "today", "3": "this week", "4": "this month" };
    if (t in periods) return { type: "brief", period: parseBriefPeriod(periods[t], user.lastBriefAt, now) };
    if (/^(brief|briefing|summary|report|ripoti|muhtasari)\b/i.test(lower)) return { type: "brief", period: parseBriefPeriod(lower, user.lastBriefAt, now) };
    if (t === "5" || /^(events?|matukio)$/.test(lower)) return reply(events(db, now));
    return { type: "ai" };
  }

  if (t === "1" || /^(results?|my results|report( card)?|matokeo)$/.test(lower)) return reply(results(db, user));
  if (t === "2" || /^(fees?|fee balance|balance|karo|ada)$/.test(lower)) return reply(fees(db, user));
  if (t === "3" || /^(events?|matukio)$/.test(lower)) return reply(events(db, now));
  if (t === "4") return reply("Sure, type your question and I'll answer it.");
  return { type: "ai" };
}
