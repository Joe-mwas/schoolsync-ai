import { recordActivity } from "@/lib/activity";
import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { mutateDb, snapshotDb } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { clientIp, loginLimiter } from "@/lib/rateLimit";
import { ADMINS } from "@/lib/types";

/**
 * DELETE { password }: the administrator erases the activity log after
 * typing their sign-in password. A backup is made first (so the old log can
 * still be recovered for a while), and the erasing itself is recorded as
 * the new log's first entry, so it can't be done unnoticed.
 */
export async function DELETE(req: Request) {
  try {
    const me = await requireApiUser(ADMINS);
    const { password } = (await req.json().catch(() => ({}))) as { password?: unknown };
    const ip = clientIp(req);
    const key = `erase-log:${me.id}`;
    if (loginLimiter.retryAfter(ip, key) > 0) throw new HttpError(429, "Too many wrong passwords. Try again in a few minutes.");
    if (typeof password !== "string" || !verifyPassword(password, me.passwordHash)) {
      loginLimiter.recordFailure(ip, key);
      throw new HttpError(400, "That password isn't right. Type the password you sign in with.");
    }
    loginLimiter.recordSuccess(ip, key);
    await snapshotDb("manual");
    const erased = await mutateDb((db) => {
      const n = db.activity.length;
      db.activity = [];
      recordActivity(db, { userId: me.id, name: me.name, role: me.role, kind: "security", action: "Erased the activity log", detail: `${n} entr${n === 1 ? "y" : "ies"} removed; a copy is in today's backup`, ip: ip !== "unknown" ? ip : undefined });
      return n;
    });
    return Response.json({ ok: true, erased });
  } catch (err) {
    return errorResponse(err);
  }
}
