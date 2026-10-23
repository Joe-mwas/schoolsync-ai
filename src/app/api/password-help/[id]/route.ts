import { logActivity } from "@/lib/activity";
import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { addFromRequest, dismissRequest, resetFromRequest } from "@/lib/passwordHelp";
import { ROLE_LABELS } from "@/lib/permissions";
import { ADMINS } from "@/lib/types";

/**
 * POST { action: "reset" | "add" | "dismiss" }. Reset gives the matched account a temporary password; add creates
 * the account from the request (with role, classId, childId) and a temporary password. Passwords are shown once.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireApiUser(ADMINS);
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { action?: unknown; role?: unknown; classId?: unknown; childId?: unknown };
    const { action } = body;
    if (action === "reset") {
      const { password, user } = await mutateDb((db) => resetFromRequest(db, admin, id));
      await logActivity(req, admin, "security", "Reset a password", `${user.name} (asked for help signing in)`);
      return Response.json({ password, name: user.name, signInWith: user.email || user.phone || "" });
    }
    if (action === "add") {
      const { password, user } = await mutateDb((db) => addFromRequest(db, admin, id, body));
      await logActivity(req, admin, "people", "Added a person", `${user.name} (${ROLE_LABELS[user.role]}) from a sign-in help request`);
      return Response.json({ password, name: user.name, signInWith: user.email || user.phone || "" });
    }
    if (action === "dismiss") {
      await mutateDb((db) => dismissRequest(db, admin, id));
      return Response.json({ ok: true });
    }
    throw new HttpError(400, "Choose reset, add or dismiss");
  } catch (err) {
    return errorResponse(err);
  }
}
