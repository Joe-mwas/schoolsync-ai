import { cookies } from "next/headers";
import { logActivity } from "@/lib/activity";
import { getCurrentUser } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  const { reason } = (await req.json().catch(() => ({}))) as { reason?: string };
  (await cookies()).delete(SESSION_COOKIE);
  if (user) await logActivity(req, user, "signin", reason === "idle" ? "Signed out automatically" : "Signed out", reason === "idle" ? "No activity" : "");
  return Response.json({ ok: true });
}
