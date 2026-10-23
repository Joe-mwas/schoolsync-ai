import { mutateDb, readDb } from "./db.ts";
import { HttpError } from "./errors.ts";
import type { AiBudget, Database } from "./types.ts";

/**
 * The AI budget guard. Every call to Claude asks `assertAiAllowed()` first
 * and reports its token counts to `recordAiUsage()` after. When the month's
 * spending reaches the school's limit, or the administrator switches the AI
 * off, the AI pauses and everything falls back to manual: the WhatsApp menu
 * still answers fees and results from the data, other questions get "the
 * office will get back to you" and wait in the WhatsApp inbox, and the
 * director's brief goes out as plain figures. Nothing else stops.
 */

/** Approximate shillings to the dollar, for showing costs. */
export const KSH_PER_USD = 130;
/** The administrator is warned when this share of the limit is used. */
export const WARN_AT = 0.8;

/** US dollars per million tokens: [input, output]. Cache writes cost 1.25× input, cache reads 0.1×. */
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};

export interface Usage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** What one call cost, in US dollars. Unknown models are priced as the top model, to be safe. */
export function callCost(model: string, usage: Usage): number {
  const key = Object.keys(PRICES).find((k) => model.startsWith(k));
  const [inp, out] = PRICES[key ?? "claude-opus-5-5"];
  const input = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) * 1.25 + (usage.cache_read_input_tokens ?? 0) * 0.1;
  return (input * inp + (usage.output_tokens ?? 0) * out) / 1_000_000;
}

/** "YYYY-MM" in Nairobi time. */
export function monthKey(now = new Date()): string {
  return new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 7);
}

export const toKsh = (usd: number) => Math.round(usd * KSH_PER_USD);

export interface BudgetState {
  month: string;
  spentKsh: number;
  limitKsh: number | null;
  calls: number;
  /** Share of the limit used (0–1+), or null without a limit. */
  share: number | null;
  /** Why the AI is paused, or null when it's running. */
  paused: "off" | "limit" | null;
  creditsOutAt: string | null;
}

export function budgetState(budget: AiBudget | undefined, now = new Date()): BudgetState {
  const month = monthKey(now);
  const m = budget?.months?.[month];
  const spentKsh = toKsh(m?.usd ?? 0);
  const limitKsh = budget?.monthlyLimitKsh ?? null;
  const share = limitKsh ? spentKsh / limitKsh : null;
  return {
    month,
    spentKsh,
    limitKsh,
    calls: m?.calls ?? 0,
    share,
    paused: budget?.off ? "off" : share !== null && share >= 1 ? "limit" : null,
    creditsOutAt: budget?.creditsOutAt ?? null,
  };
}

export const PAUSED_MESSAGE = {
  off: "The AI is switched off for now (manual mode). The rest of the system works as usual; the administrator can turn it back on in Setup.",
  limit: "The AI has reached this month's budget, so it's paused until next month. The rest of the system works as usual; the administrator can raise the limit in Setup.",
} as const;

/** Is the AI configured and running (not switched off, not over budget)? */
export async function aiRunning(): Promise<boolean> {
  if (!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)) return false;
  return budgetState((await readDb()).aiBudget).paused === null;
}

/** Throws a friendly 503 when the AI is paused. Call before every request to Claude. */
export async function assertAiAllowed(): Promise<void> {
  const { paused } = budgetState((await readDb()).aiBudget);
  if (paused) throw new HttpError(503, PAUSED_MESSAGE[paused]);
}

/** Add one call's cost to this month; returns the alert to send, if this call crossed a line. */
export function addUsage(db: Database, feature: string, usd: number, now = new Date()): "warned" | "reached" | null {
  const month = monthKey(now);
  const b = db.aiBudget;
  const m = (b.months[month] ??= { usd: 0, calls: 0, byFeature: {} });
  m.usd += usd;
  m.calls++;
  m.byFeature[feature] = (m.byFeature[feature] ?? 0) + usd;
  for (const k of Object.keys(b.months).sort().slice(0, -12)) delete b.months[k];
  b.creditsOutAt = null;

  if (b.alerts.month !== month) b.alerts = { month, warned: false, reached: false };
  const { share } = budgetState(b, now);
  if (share === null) return null;
  if (share >= 1 && !b.alerts.reached) {
    b.alerts.reached = b.alerts.warned = true;
    return "reached";
  }
  if (share >= WARN_AT && !b.alerts.warned) {
    b.alerts.warned = true;
    return "warned";
  }
  return null;
}

/** Record what a call cost (never throws), and tell the administrator when a line is crossed. */
export async function recordAiUsage(feature: string, model: string, usage: Usage | null | undefined): Promise<void> {
  if (!usage) return;
  try {
    const usd = callCost(model, usage);
    const alert = await mutateDb((db) => addUsage(db, feature, usd));
    if (alert) await alertAdmins(alert);
  } catch (err) {
    console.error("Couldn't record AI usage", err);
  }
}

/** Claude refused for lack of credit: note it once and tell the administrator. */
export async function noteAiError(err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  if (!/credit balance/i.test(message)) return;
  try {
    const first = await mutateDb((db) => {
      const was = db.aiBudget.creditsOutAt;
      db.aiBudget.creditsOutAt = new Date().toISOString();
      return !was;
    });
    if (first) await alertAdmins("credits");
  } catch (e) {
    console.error("Couldn't record the AI credit problem", e);
  }
}

async function alertAdmins(kind: "warned" | "reached" | "credits"): Promise<void> {
  const db = await readDb();
  const s = budgetState(db.aiBudget);
  const text = {
    warned: `SchoolSync: the AI has used KSh ${s.spentKsh.toLocaleString("en-KE")} of this month's KSh ${(s.limitKsh ?? 0).toLocaleString("en-KE")} budget (${Math.round((s.share ?? 0) * 100)}%). It pauses at the limit; you can raise it in Setup → Connections & security.`,
    reached: `SchoolSync: the AI reached this month's budget of KSh ${(s.limitKsh ?? 0).toLocaleString("en-KE")} and is paused until next month. The system keeps working in manual mode: parents still get fees and results from the WhatsApp menu, and other questions wait in the WhatsApp inbox. Raise the limit in Setup to turn it back on.`,
    credits: "SchoolSync: Claude says the AI credit has run out, so AI answers are paused and the system is in manual mode. Add credit in the Claude Console (Billing); the AI resumes by itself on the next question.",
  }[kind];
  const { logActivity } = await import("./activity.ts");
  await logActivity(null, null, "settings", kind === "credits" ? "AI credit ran out" : kind === "reached" ? "AI budget reached: AI paused" : "AI budget 80% used", text.replace(/^SchoolSync: /, ""), "System");
  const { notifyPerson } = await import("./notify.ts");
  for (const admin of db.users.filter((u) => u.role === "admin" && u.phone)) {
    await notifyPerson(admin, "AI budget", text, "ai-budget").catch((e) => console.error("AI budget alert failed", e));
  }
}

const FEATURE_LABELS: Record<string, string> = {
  "whatsapp-family": "Parents' and learners' WhatsApp questions",
  "whatsapp-staff": "Staff WhatsApp questions",
  "assistant-family": "AI Assistant (parents and learners)",
  "assistant-staff": "AI Assistant (staff)",
  "admin-ai": "Admin AI",
  "chat-buddy": "Chat buddy",
  "school-ai": "School AI (director, headteacher)",
  brief: "Director's briefs",
  insights: "Dashboard AI insights",
  announcement: "Announcement drafts",
  test: "Connection tests",
};

/** What the Setup page shows: this month in shillings, by feature, and last month for comparison. */
export function budgetView(budget: AiBudget | undefined, now = new Date()) {
  const s = budgetState(budget, now);
  const prev = new Date(now.getTime() + 3 * 3600_000);
  prev.setUTCDate(1);
  prev.setUTCMonth(prev.getUTCMonth() - 1);
  const last = budget?.months?.[prev.toISOString().slice(0, 7)];
  const byFeature = Object.entries(budget?.months?.[s.month]?.byFeature ?? {})
    .map(([k, usd]) => ({ label: FEATURE_LABELS[k] ?? k, ksh: toKsh(usd) }))
    .filter((f) => f.ksh > 0)
    .sort((a, b) => b.ksh - a.ksh);
  return { spentKsh: s.spentKsh, limitKsh: s.limitKsh, calls: s.calls, paused: s.paused, creditsOutAt: s.creditsOutAt, byFeature, lastMonthKsh: last ? toKsh(last.usd) : null };
}
