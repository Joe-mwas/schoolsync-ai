/**
 * When the directors' morning brief goes out: MORNING_BRIEF_TIME (Nairobi
 * time, default 07:00; "off" to stop) and MORNING_BRIEF_DAYS ("weekdays",
 * the default, or "daily").
 */

type Env = Record<string, string | undefined>;
const EAT_OFFSET_MS = 3 * 3600_000; // Nairobi is UTC+3 all year
/** A brief that couldn't go out by noon waits for the next morning. */
export const LATEST_MINUTE = 12 * 60;

export interface MorningBriefConfig {
  minute: number;
  label: string;
  weekdaysOnly: boolean;
}

export function morningBriefConfig(env: Env = process.env): MorningBriefConfig | null {
  const raw = (env.MORNING_BRIEF_TIME ?? "").trim().toLowerCase();
  if (raw === "off" || raw === "none") return null;
  const m = (raw || "07:00").match(/^(\d{1,2})(?::(\d{2}))?$/);
  const h = m ? Number(m[1]) : 7;
  const min = m && m[2] ? Number(m[2]) : 0;
  const valid = m && h < 12 && min < 60;
  const minute = valid ? h * 60 + min : 7 * 60;
  return {
    minute,
    label: `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`,
    weekdaysOnly: (env.MORNING_BRIEF_DAYS ?? "weekdays").trim().toLowerCase() !== "daily",
  };
}

export function nairobiClock(now: number): { date: string; minute: number; weekday: number } {
  const t = new Date(now + EAT_OFFSET_MS);
  return { date: t.toISOString().slice(0, 10), minute: t.getUTCHours() * 60 + t.getUTCMinutes(), weekday: t.getUTCDay() };
}

