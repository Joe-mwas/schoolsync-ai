import { setSessionCookie } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { clientIp, loginLimiter } from "@/lib/rateLimit";

export async function POST(req: Request) {
  const { email, password } = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  if (!email || !password) {
    return Response.json({ error: "Email and password are required" }, { status: 400 });
  }

  const ip = clientIp(req);
  const wait = loginLimiter.retryAfter(ip, email);
  if (wait > 0) {
    const minutes = Math.ceil(wait / 60_000);
    return Response.json(
      { error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` },
      { status: 429, headers: { "Retry-After": String(Math.ceil(wait / 1000)) } },
    );
  }

  const db = await readDb();
  const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  if (!user || !verifyPassword(password, user.passwordHash)) {
    loginLimiter.recordFailure(ip, email);
    return Response.json({ error: "Invalid email or password" }, { status: 401 });
  }
  loginLimiter.recordSuccess(ip, email);
  await setSessionCookie(user);
  return Response.json({ ok: true });
}
