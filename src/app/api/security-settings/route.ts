import { logActivity } from "@/lib/activity";
import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { ADMINS, IDLE_CHOICES } from "@/lib/types";

/** The administrator sets whether staff must use two-step sign-in, and the auto sign-out time. */
export async function PUT(req: Request) {
  try {
    const me = await requireApiUser(ADMINS);
    const { requireTwoStep, idleMinutes } = (await req.json().catch(() => ({}))) as { requireTwoStep?: unknown; idleMinutes?: unknown };
    if (typeof requireTwoStep !== "boolean" || !(IDLE_CHOICES as readonly unknown[]).includes(idleMinutes)) {
      throw new HttpError(400, "Choose the settings again");
    }
    // So nobody is surprised: the administrator goes first.
    if (requireTwoStep && !me.twoStep) {
      throw new HttpError(400, "Turn on two-step sign-in for your own account first (My account), then require it for staff.");
    }
    const before = await mutateDb((db) => {
      const old = { ...db.security };
      db.security = { requireTwoStep, idleMinutes: idleMinutes as number };
      return old;
    });
    const changes = [
      before.requireTwoStep !== requireTwoStep ? `Two-step sign-in for staff: ${requireTwoStep ? "required" : "optional"}` : "",
      before.idleMinutes !== idleMinutes ? `Auto sign-out: after ${idleMinutes} minutes` : "",
    ].filter(Boolean);
    if (changes.length) await logActivity(req, me, "settings", "Changed sign-in security", changes.join("; "));
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
