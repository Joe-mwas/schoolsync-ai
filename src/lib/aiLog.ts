import { mutateDb, newId } from "./db.ts";
import type { AiChannel, AiLogEntry } from "./types.ts";

/** Oldest entries are dropped beyond this, keeping the data file small. */
export const MAX_AI_LOGS = 5000;
const MAX_TEXT = 8000;

const clip = (s: string) => (s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}…` : s);

/**
 * Record one AI exchange for the administrator's review. Never throws: a
 * logging problem must not break the answer the person is waiting for.
 */
export async function logAiExchange(channel: AiChannel, userId: string | null, question: string, answer: string): Promise<void> {
  const entry: AiLogEntry = {
    id: newId("ai"),
    channel,
    userId,
    question: clip(question.trim()),
    answer: clip(answer.trim()),
    createdAt: new Date().toISOString(),
    flagged: false,
    note: null,
    reviewedAt: null,
  };
  try {
    await mutateDb((db) => {
      db.aiLogs.push(entry);
      if (db.aiLogs.length > MAX_AI_LOGS) db.aiLogs.splice(0, db.aiLogs.length - MAX_AI_LOGS);
    });
  } catch (err) {
    console.error("failed to log AI exchange", err);
  }
}

export interface AiLogFilter {
  show?: "all" | "flagged" | "unreviewed";
  channel?: AiChannel | "";
  q?: string;
}

/** Newest first, filtered for the review page. */
export function filterAiLogs(
  logs: AiLogEntry[],
  filter: AiLogFilter,
  nameOf: (userId: string | null) => string = () => "",
): AiLogEntry[] {
  const q = filter.q?.trim().toLowerCase() ?? "";
  return logs
    .filter((l) => filter.show !== "flagged" || l.flagged)
    .filter((l) => filter.show !== "unreviewed" || !l.reviewedAt)
    .filter((l) => !filter.channel || l.channel === filter.channel)
    .filter((l) => !q || [l.question, l.answer, nameOf(l.userId)].some((t) => t.toLowerCase().includes(q)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
