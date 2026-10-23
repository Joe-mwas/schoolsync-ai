import { logActivity, recordActivity } from "@/lib/activity";
import { setSessionCookie } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { clientIp, loginLimiter } from "@/lib/rateLimit";
import { readTicket } from "@/lib/session";
import { spendBackupCode, verifyCode } from "@/lib/totp";

/** The second step of signing in: the ticket from the password step plus a code from the app (or a backup code). */
export async function POST(req: Request) {
  const { ticket, code } = (await req.json().catch(() => ({}))) as { ticket?: string; code?: string };
  const pass = readTicket(ticket);
  if (!pass) return Response.json({ error: "That took too long. Sign in again.", restart: true }, { status: 401 });
  if (typeof code !== "string" || !code.trim()) return Response.json({ error: "Type the 6-digit code from your app" }, { status: 400 });

  const ip = clientIp(req);
  const account = `2fa:${pass.uid}`;
  const wait = loginLimiter.retryAfter(ip, account);
  if (wait > 0) {
    const minutes = Math.ceil(wait / 60_000);
    return Response.json({ error: `Too many wrong codes. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` }, { status: 429 });
  }

  const outcome = await mutateDb((db) => {
    const user = db.users.find((u) => u.id === pass.uid);
    if (!user || !user.twoStep || (user.sessionVersion ?? 0) !== pass.version) return { kind: "restart" as const };
    const step = verifyCode(user.twoStep.secret, code, { lastStep: user.twoStep.lastStep });
    if (step !== null) {
      user.twoStep.lastStep = step;
      return { kind: "ok" as const, user, detail: "" };
    }
    const left = spendBackupCode(user.twoStep.backupCodes, code);
    if (left) {
      user.twoStep.backupCodes = left;
      recordActivity(db, { userId: user.id, name: user.name, role: user.role, kind: "security", action: "Used a backup code", detail: `${left.length} left`, ip });
      return { kind: "ok" as const, user, detail: "with a backup code" };
    }
    return { kind: "wrong" as const, user };
  });

  if (outcome.kind === "restart") return Response.json({ error: "Sign in again.", restart: true }, { status: 401 });
  if (outcome.kind === "wrong") {
    loginLimiter.recordFailure(ip, account);
    await logActivity(req, outcome.user, "signin", "Failed sign-in", "Wrong two-step code");
    return Response.json({ error: "That code isn't right. Check the time on your phone and try the newest code." }, { status: 401 });
  }
  loginLimiter.recordSuccess(ip, account);
  await setSessionCookie(outcome.user);
  await logActivity(req, outcome.user, "signin", "Signed in", outcome.detail || "with a two-step code");
  return Response.json({ ok: true });
}
