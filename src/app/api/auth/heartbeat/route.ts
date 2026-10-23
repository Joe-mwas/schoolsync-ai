import { currentSession, errorResponse, HttpError, isStaff, setSessionCookie } from "@/lib/auth";

/**
 * Sent by the page while a staff member is active: extends their session by
 * the school's auto sign-out time. With no activity there's no heartbeat, so
 * the session runs out even if the browser stays open.
 */
export async function POST() {
  try {
    const current = await currentSession();
    if (!current) throw new HttpError(401, "Not signed in");
    if (isStaff(current.user)) await setSessionCookie(current.user, { issuedAt: current.session.iat });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
