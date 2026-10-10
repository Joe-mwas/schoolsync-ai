/**
 * When Meta last talked to the webhook, kept in memory (so it resets when the
 * app restarts). Shown on the Setup page to confirm Meta is really delivering.
 */

interface Activity {
  verifiedAt: string | null;
  receivedAt: string | null;
}

const g = globalThis as typeof globalThis & { __schoolsyncWebhook?: Activity };
const activity: Activity = (g.__schoolsyncWebhook ??= { verifiedAt: null, receivedAt: null });

export const SELF_TEST_HEADER = "x-schoolsync-self-test";

export function recordWebhook(kind: "verified" | "received"): void {
  activity[kind === "verified" ? "verifiedAt" : "receivedAt"] = new Date().toISOString();
}

export function webhookActivity(): Readonly<Activity> {
  return { ...activity };
}
