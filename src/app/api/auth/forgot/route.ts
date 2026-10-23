import { alertPasswordHelp } from "@/lib/alerts";
import { schoolName } from "@/lib/ai";
import { mutateDb, readDb } from "@/lib/db";
import { errorResponse } from "@/lib/auth";
import { notifyPerson } from "@/lib/notify";
import { passwordHelpMessage, requestPasswordHelp, type PasswordHelpInput } from "@/lib/passwordHelp";
import { phoneKey } from "@/lib/phone";
import { clientIp, LoginLimiter } from "@/lib/rateLimit";

// Anyone can ask, so keep it from being used to flood the administrator.
const limiter = new LoginLimiter({ windowMs: 60 * 60 * 1000, maxPerAccount: 3, maxPerIp: 5 });

/** "Forgot your password?": tell the administrator. The reply is the same whether or not the details match an account. */
export async function POST(req: Request) {
  try {
    const input = (await req.json().catch(() => ({}))) as PasswordHelpInput;
    const raw = typeof input.contact === "string" ? input.contact.trim() : "";
    const account = raw.includes("@") ? raw.toLowerCase() : phoneKey(raw) || raw;
    const ip = clientIp(req);
    if (limiter.retryAfter(ip, account) > 0) {
      return Response.json({ error: "You've already asked. The school will be in touch; please try again later." }, { status: 429 });
    }
    const { request, isNew } = await mutateDb((db) => requestPasswordHelp(db, input));
    limiter.recordFailure(ip, account);
    if (isNew) {
      void alertPasswordHelp(request);
      const db = await readDb();
      const text = passwordHelpMessage(db, request, schoolName());
      for (const admin of db.users.filter((u) => u.role === "admin")) {
        await notifyPerson(admin, "Password help request", text, "password-help").catch((err) => console.error("Password help alert failed", err));
      }
    }
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
