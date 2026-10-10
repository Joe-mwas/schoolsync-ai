import { setSessionCookie } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { phoneKey } from "@/lib/phone";
import { clientIp, loginLimiter } from "@/lib/rateLimit";
import { findBySignInName } from "@/lib/users";

export async function POST(req: Request) {
  const { email, password } = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
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
    return Response.json({ error: "Incorrect sign-in details" }, { status: 401 });
  }
  loginLimiter.recordSuccess(ip, account);
  await setSessionCookie(user);
  return Response.json({ ok: true });
}
