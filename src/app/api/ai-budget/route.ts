import { logActivity } from "@/lib/activity";
import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { ADMINS } from "@/lib/types";

/** PUT { monthlyLimitKsh: number | null, off: boolean }: the administrator sets the AI's monthly limit, or switches it off. */
export async function PUT(req: Request) {
  try {
    const me = await requireApiUser(ADMINS);
    const { monthlyLimitKsh, off } = (await req.json().catch(() => ({}))) as { monthlyLimitKsh?: unknown; off?: unknown };
    if (typeof off !== "boolean") throw new HttpError(400, "Choose whether the AI is on or off");
    let limit: number | null = null;
    if (monthlyLimitKsh !== null && monthlyLimitKsh !== "" && monthlyLimitKsh !== undefined) {
      limit = Math.round(Number(monthlyLimitKsh));
      if (!Number.isFinite(limit) || limit < 100 || limit > 10_000_000) throw new HttpError(400, "Set a monthly limit of at least KSh 100, or leave it blank for no limit");
    }
    const before = await mutateDb((db) => {
      const old = { limit: db.aiBudget.monthlyLimitKsh, off: db.aiBudget.off };
      db.aiBudget.monthlyLimitKsh = limit;
      db.aiBudget.off = off;
      // A new limit gets fresh warnings.
      if (old.limit !== limit) db.aiBudget.alerts = { ...db.aiBudget.alerts, warned: false, reached: false };
      return old;
    });
    const changes = [
      before.off !== off ? (off ? "AI switched off (manual mode)" : "AI switched back on") : "",
      before.limit !== limit ? `Monthly limit: ${limit ? `KSh ${limit.toLocaleString("en-KE")}` : "none"}` : "",
    ].filter(Boolean);
    if (changes.length) await logActivity(req, me, "settings", "Changed the AI budget", changes.join("; "));
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
