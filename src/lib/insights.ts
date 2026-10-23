import { createHash } from "node:crypto";
import { classLevels, feesByClass, monthlyCollections, performanceTrend } from "./charts.ts";
import { formatMoney, schoolFees } from "./fees.ts";
import { examPerformance, examsFor } from "./results.ts";
import type { Database, InsightScope, Role, SavedInsights } from "./types.ts";

/**
 * "AI insights" under the dashboard charts: the AI reads the same figures
 * the charts show and says what's going well, what needs attention and what
 * to do next. The figures are written out here (no names of learners or
 * parents), and the answer is saved and reused until the figures change or
 * a day passes, so a dashboard visit doesn't call the AI every time.
 */

export const INSIGHTS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** The same split as the charts: each role only hears about what it can see. */
export function insightScope(role: Role): InsightScope | null {
  if (role === "admin" || role === "director") return "all";
  if (role === "headteacher") return "performance";
  if (role === "secretary") return "money";
  return null;
}

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

/** The figures, as short plain lines. Empty when there's nothing to read yet. */
export function insightFacts(db: Database, scope: InsightScope, now = new Date()): string {
  const lines: string[] = [];
  if (scope !== "money") {
    const trend = performanceTrend(db);
    if (trend.length) {
      lines.push("School performance (share of results at Meeting or Exceeding Expectations), oldest exam first:");
      for (const t of trend) lines.push(`- ${t.exam}: ${t.meeting}% (${t.learners} learners)`);
      const exam = examsFor(db)[0];
      const perf = exam ? examPerformance(db, exam) : [];
      const levels = classLevels(db);
      if (levels.exam) lines.push(`By class in ${levels.exam}:`);
      for (const c of levels.classes) {
        const p = perf.find((x) => x.className === c.className);
        lines.push(`- ${c.className}: ${pct(c.counts.EE + c.counts.ME, c.total)}% meeting or exceeding; EE ${c.counts.EE}, ME ${c.counts.ME}, AE ${c.counts.AE}, BE ${c.counts.BE}; weakest area ${p?.weakestArea ?? "n/a"}; ${p?.needingSupport.length ?? 0} learners with Below Expectations in half their areas or more`);
      }
    }
  }
  if (scope !== "performance") {
    const months = monthlyCollections(db, 12, now).filter((m, i, all) => m.amount > 0 || i >= all.length - 3);
    if (months.some((m) => m.amount > 0)) {
      lines.push("Fees collected per month (most recent last):");
      for (const m of months) lines.push(`- ${m.month}: ${formatMoney(m.amount)} from ${m.payments} payments`);
    }
    const byClass = feesByClass(db);
    if (byClass.length) {
      const f = schoolFees(db, new Date(now.getTime() - 7 * 86_400_000).toISOString());
      lines.push(`Fees overall: ${formatMoney(f.paid)} paid, ${formatMoney(f.outstanding)} still owed (${pct(f.paid, f.paid + f.outstanding)}% collected); ${formatMoney(f.collectedSince)} collected in the last 7 days.`);
      lines.push("By class:");
      for (const c of byClass) lines.push(`- ${c.className}: ${formatMoney(c.paid)} paid, ${formatMoney(c.outstanding)} owed (${pct(c.paid, c.paid + c.outstanding)}% collected, ${c.learners} learners)`);
    }
  }
  return lines.join("\n");
}

export function factsKey(facts: string): string {
  return createHash("sha256").update(facts).digest("hex").slice(0, 16);
}

/** Saved insights still match the figures and are under a day old. */
export function insightsFresh(saved: SavedInsights | undefined, facts: string, now = Date.now()): boolean {
  return Boolean(saved && saved.factsKey === factsKey(facts) && now - Date.parse(saved.generatedAt) < INSIGHTS_MAX_AGE_MS);
}

export const INSIGHTS_SCHEMA = {
  type: "object",
  properties: {
    goingWell: { type: "array", items: { type: "string" }, description: "1 to 3 short points on what's going well" },
    needsAttention: { type: "array", items: { type: "string" }, description: "1 to 3 short points on what needs attention" },
    nextSteps: { type: "array", items: { type: "string" }, description: "1 to 3 concrete actions for this week" },
  },
  required: ["goingWell", "needsAttention", "nextSteps"],
  additionalProperties: false,
} as const;

export const INSIGHTS_SYSTEM = `You advise the leadership of a Kenyan CBC school. You are given the school's figures (results and/or fees) exactly as its dashboard charts show them.

Write three short lists:
- goingWell: what is going well.
- needsAttention: what needs attention.
- nextSteps: concrete actions for this week, each one something a director, headteacher or bursar can do.

Rules:
- Use only the figures given. Quote them (percentages, Ksh amounts, class and exam names) so each point can be checked against the charts. Never invent a number, a cause, a name or a trend that the figures don't show.
- 1 to 3 points per list, each one sentence of at most about 25 words. Plain words, no jargon, no Markdown.
- If the figures are too thin to say something (for example a single exam), say so plainly instead of guessing.
- CBC levels: EE Exceeding, ME Meeting, AE Approaching, BE Below Expectations.`;
