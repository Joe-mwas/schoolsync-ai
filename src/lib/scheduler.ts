import { morningBriefTick } from "./morningBrief.ts";
import { morningBriefConfig } from "./morningBriefConfig.ts";
import { offsiteTick } from "./offsiteJob.ts";

const g = globalThis as typeof globalThis & { __schoolsyncScheduler?: NodeJS.Timeout };

/** Background jobs inside the web server (one instance on Render): the morning brief and the daily off-site backup. */
export function startScheduler(): void {
  if (g.__schoolsyncScheduler) return;
  const tick = () => {
    void morningBriefTick().catch((err) => console.error("Scheduler tick failed", err));
    void offsiteTick().catch((err) => console.error("Off-site backup tick failed", err));
  };
  g.__schoolsyncScheduler = setInterval(tick, 5 * 60_000);
  g.__schoolsyncScheduler.unref?.();
  setTimeout(tick, 30_000).unref?.();
  const cfg = morningBriefConfig();
  console.log(cfg ? `Scheduler started: directors' morning brief at ${cfg.label} Nairobi time, ${cfg.weekdaysOnly ? "weekdays" : "daily"}` : "Scheduler started: morning brief is off");
}
