import { formatMoney, schoolFees, type SchoolFees } from "./fees.ts";
import { examPerformance, examsFor, type ClassPerformance } from "./results.ts";
import type { Database } from "./types.ts";

const DAY = 86_400_000;

export interface BriefPeriod {
  since: string;
  label: string;
}

/**
 * Work out what period a brief should cover from what the director typed:
 * "brief today", "brief yesterday", "brief this week", "brief this month",
 * "brief this term". Otherwise: since their last brief (at most a month),
 * or the last 7 days if they've never had one.
 */
export function parseBriefPeriod(text: string, lastBriefAt: string | null | undefined, now = Date.now()): BriefPeriod {
  const t = text.toLowerCase();
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  if (/\btoday\b|\bleo\b/.test(t)) return { since: startOfDay.toISOString(), label: "today" };
  if (/\byesterday\b|\bjana\b/.test(t)) return { since: new Date(startOfDay.getTime() - DAY).toISOString(), label: "since yesterday" };
  if (/\bweek\b|\bwiki\b|\b7 ?days\b/.test(t)) return { since: new Date(now - 7 * DAY).toISOString(), label: "the last 7 days" };
  if (/\bmonth\b|\bmwezi\b|\b30 ?days\b/.test(t)) return { since: new Date(now - 30 * DAY).toISOString(), label: "the last 30 days" };
  if (/\bterm\b|\bmuhula\b/.test(t)) return { since: new Date(now - 90 * DAY).toISOString(), label: "the last 3 months" };
  if (lastBriefAt) {
    const since = Math.max(Date.parse(lastBriefAt), now - 31 * DAY);
    return { since: new Date(since).toISOString(), label: `since your last brief (${new Date(since).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })})` };
  }
  return { since: new Date(now - 7 * DAY).toISOString(), label: "the last 7 days" };
}

export interface BriefData {
  period: BriefPeriod;
  fees: SchoolFees;
  latestExam: string | null;
  performance: ClassPerformance[];
  parentMessages: { count: number; parents: number; unanswered: number; samples: string[] };
  aiQuestions: number;
  flaggedAi: number;
  announcements: string[];
  upcomingEvents: string[];
}

/** Everything the brief reports, computed from the school's records. */
export function briefData(db: Database, period: BriefPeriod, now = Date.now()): BriefData {
  const since = period.since;
  const parents = new Set(db.users.filter((u) => u.role === "parent").map((u) => u.id));
  const inbound = db.whatsappMessages.filter((m) => m.direction === "inbound" && m.createdAt >= since);
  const fromParents = inbound.filter((m) => m.userId && parents.has(m.userId));
  // A message is unanswered if no reply to that number was delivered (or at least sent) after it.
  const unanswered = inbound.filter(
    (m) => !db.whatsappMessages.some((o) => o.direction === "outbound" && o.phone === m.phone && o.createdAt >= m.createdAt && o.status !== "failed"),
  ).length;
  const latestExam = examsFor(db)[0] ?? null;
  const today = new Date(now).toISOString().slice(0, 10);
  const in14 = new Date(now + 14 * DAY).toISOString().slice(0, 10);
  return {
    period,
    fees: schoolFees(db, since),
    latestExam,
    performance: latestExam ? examPerformance(db, latestExam) : [],
    parentMessages: {
      count: fromParents.length,
      parents: new Set(fromParents.map((m) => m.userId)).size,
      unanswered,
      samples: fromParents.slice(-40).map((m) => m.body.slice(0, 200)),
    },
    aiQuestions: db.aiLogs.filter((l) => l.createdAt >= since).length,
    flaggedAi: db.aiLogs.filter((l) => l.flagged).length,
    announcements: db.announcements.filter((a) => a.createdAt >= since).map((a) => `${a.priority === "urgent" ? "URGENT: " : ""}${a.title}`),
    upcomingEvents: db.events
      .filter((e) => e.date >= today && e.date <= in14)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => `${e.date}: ${e.title}`),
  };
}

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–");

/** A complete brief without the AI (used when it's off, or as the AI's fallback). */
export function formatBrief(schoolName: string, d: BriefData): string {
  const f = d.fees;
  const lines: string[] = [`📋 ${schoolName} brief — ${d.period.label}`, ""];
  lines.push(
    "💰 FEES",
    `Collected in this period: ${formatMoney(f.collectedSince)} (${f.paymentsSince} payment${f.paymentsSince === 1 ? "" : "s"})`,
    `Overall: ${formatMoney(f.paid)} of ${formatMoney(f.charged)} collected (${pct(f.paid, f.charged)}); ${formatMoney(f.outstanding)} outstanding`,
  );
  for (const c of f.byClass.slice(0, 4)) lines.push(`• ${c.className}: ${formatMoney(c.outstanding)} owed by ${c.learnersOwing}`);
  if (f.topBalances.length) lines.push(`Largest balances: ${f.topBalances.slice(0, 3).map((b) => `${b.name} (${formatMoney(b.balance)})`).join(", ")}`);

  lines.push("", "📘 RESULTS");
  if (!d.latestExam) lines.push("No results recorded yet.");
  else {
    lines.push(`Latest: ${d.latestExam}`);
    for (const p of d.performance) {
      const support = p.needingSupport.length ? `; needing support: ${p.needingSupport.slice(0, 3).join(", ")}` : "";
      lines.push(`• ${p.className}: EE ${p.counts.EE}, ME ${p.counts.ME}, AE ${p.counts.AE}, BE ${p.counts.BE}; weakest area ${p.weakestArea ?? "–"}${support}`);
    }
  }

  const pm = d.parentMessages;
  lines.push("", "💬 PARENTS ON WHATSAPP", `${pm.count} message${pm.count === 1 ? "" : "s"} from ${pm.parents} parent${pm.parents === 1 ? "" : "s"}; ${pm.unanswered} without a reply`);
  lines.push(`AI answered ${d.aiQuestions} question${d.aiQuestions === 1 ? "" : "s"}; ${d.flaggedAi} answer${d.flaggedAi === 1 ? "" : "s"} flagged as wrong`);

  lines.push("", "📅 EVENTS & NOTICES");
  lines.push(d.upcomingEvents.length ? `Next 2 weeks: ${d.upcomingEvents.join("; ")}` : "No events in the next 2 weeks.");
  if (d.announcements.length) lines.push(`Announcements posted: ${d.announcements.join("; ")}`);
  return lines.join("\n");
}

/** WhatsApp allows 4,096 characters per message; split on paragraph breaks. */
export function splitMessage(text: string, max = 3800): string[] {
  if (text.length <= max) return [text];
  const parts: string[] = [];
  let current = "";
  for (const para of text.split(/\n\n/)) {
    const piece = current ? `${current}\n\n${para}` : para;
    if (piece.length <= max) current = piece;
    else {
      if (current) parts.push(current);
      for (let i = 0; i < para.length; i += max) parts.push(para.slice(i, i + max));
      current = parts.pop()!;
    }
  }
  if (current) parts.push(current);
  return parts;
}
