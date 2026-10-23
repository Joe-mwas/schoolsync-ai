import { logActivity } from "@/lib/activity";
import { setSessionCookie } from "@/lib/auth";
import { createTicket } from "@/lib/session";
import { readDb } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { phoneKey } from "@/lib/phone";
import { clientIp, loginLimiter } from "@/lib/rateLimit";
import { ROLE_LABELS } from "@/lib/permissions";
import { ROLES, type Role } from "@/lib/types";
import { findBySignInName } from "@/lib/users";

export async function POST(req: Request) {
  const { email, password, role } = (await req.json().catch(() => ({}))) as { email?: string; password?: string; role?: string };
  if (!email || !password) {
    return Response.json({ error: "Email or phone, and password, are required" }, { status: 400 });
  }

  const ip = clientIp(req);
  // Count failures per account, however the phone number was typed.
  const account = email.includes("@") ? email.trim().toLowerCase() : phoneKey(email) || email.trim();
  const wait = loginLimiter.retryAfter(ip, account);
  if (wait > 0) {
    const minutes = Math.ceil(wait / 60_000);
    return Response.json(
      { error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` },
      { status: 429, headers: { "Retry-After": String(Math.ceil(wait / 1000)) } },
    );
  }

  const db = await readDb();
  const user = findBySignInName(db, email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    loginLimiter.recordFailure(ip, account);
    await logActivity(req, user ?? null, "signin", "Failed sign-in", user ? "Wrong password" : "No account with that email or phone", "Unknown");
    return Response.json({ error: "Incorrect sign-in details" }, { status: 401 });
  }
  loginLimiter.recordSuccess(ip, account);
  // The role picked on the sign-in page only guides people; the account decides what they can do.
  // Told only after the right password, so it reveals nothing to a stranger.
  if (role && (ROLES as readonly string[]).includes(role) && role !== user.role) {
    const actual = ROLE_LABELS[user.role];
    return Response.json(
      { error: `This is a ${actual} account, so the role is now set to ${actual}. Click Sign in again.`, role: user.role as Role },
      { status: 403 },
    );
  }
  // With two-step sign-in, the password only earns a short ticket; the code finishes it.
  if (user.twoStep) {
    return Response.json({ twoStep: true, ticket: createTicket(user.id, user.sessionVersion ?? 0) });
  }
  await setSessionCookie(user);
  await logActivity(req, user, "signin", "Signed in");
  return Response.json({ ok: true });
}
