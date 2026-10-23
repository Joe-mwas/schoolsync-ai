import { recordActivity } from "@/lib/activity";
import { schoolName } from "@/lib/ai";
import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { mutateDb, readDb, snapshotDb } from "@/lib/db";
import { eraseSchool } from "@/lib/erase";
import { notifyPerson } from "@/lib/notify";
import { verifyPassword } from "@/lib/password";
import { pushTo } from "@/lib/push";
import { clientIp, loginLimiter } from "@/lib/rateLimit";
import { rememberProfileName } from "@/lib/schoolProfile";
import { verifyCode } from "@/lib/totp";
import { ADMINS } from "@/lib/types";

/**
 * POST { password, code, schoolName }: erase everything (see eraseSchool).
 * Locks: administrator only; their sign-in password; their two-step code
 * when it's on; the school's name typed exactly. A "Before erase" backup is
 * made first (restore it from School Admin → Backups), and the
 * administrators are told on WhatsApp and their phones.
 */
export async function POST(req: Request) {
  try {
    const me = await requireApiUser(ADMINS);
    const body = (await req.json().catch(() => ({}))) as { password?: unknown; code?: unknown; schoolName?: unknown };
    const ip = clientIp(req);
    const key = `erase-all:${me.id}`;
    if (loginLimiter.retryAfter(ip, key) > 0) throw new HttpError(429, "Too many wrong attempts. Try again in 15 minutes.");
    const fail = (message: string) => {
      loginLimiter.recordFailure(ip, key);
      return new HttpError(400, message);
    };

    if (typeof body.password !== "string" || !verifyPassword(body.password, me.passwordHash)) throw fail("That password isn't right.");
    if (me.twoStep) {
      const step = typeof body.code === "string" ? verifyCode(me.twoStep.secret, body.code, { lastStep: me.twoStep.lastStep }) : null;
      if (step === null) throw fail("That two-step code isn't right. Type the newest code from your app.");
      await mutateDb((db) => {
        const u = db.users.find((x) => x.id === me.id);
        if (u?.twoStep) u.twoStep.lastStep = step;
      });
    }
    const name = (await readDb()).profile.name || schoolName();
    const typed = typeof body.schoolName === "string" ? body.schoolName.trim().toLowerCase() : "";
    if (typed !== name.trim().toLowerCase()) throw fail(`Type the school's name exactly as shown: ${name}`);
    loginLimiter.recordSuccess(ip, key);

    const backup = await snapshotDb("before-erase");
    const counts = await mutateDb((db) => {
      const c = eraseSchool(db, me);
      recordActivity(db, {
        userId: me.id,
        name: me.name,
        role: me.role,
        kind: "security",
        action: "Erased all school data",
        detail: `${name}: ${c.people} people and ${c.classes} classes removed. Restore the "Before erase" backup (${backup.name}) in School Admin → Backups to undo.`,
        ip: ip !== "unknown" ? ip : undefined,
      });
      rememberProfileName(db);
      return c;
    });

    const when = new Date().toLocaleString("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    const text = `SchoolSync: all of ${name}'s data was erased by ${me.name} on ${when}. If this wasn't you, sign in now and restore the "Before erase" backup in School Admin → Backups, then change your password.`;
    const db = await readDb();
    for (const admin of db.users.filter((u) => u.role === "admin")) {
      await notifyPerson(admin, "All data erased", text).catch((err) => console.error("Erase alert failed", err));
    }
    void pushTo(db.users.filter((u) => u.role === "admin").map((u) => u.id), { title: "All school data was erased", body: `By ${me.name} on ${when}. Tap to review.`, url: "/activity" });
    return Response.json({ ok: true, ...counts, backup: backup.name });
  } catch (err) {
    return errorResponse(err);
  }
}
