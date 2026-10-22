import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { dismissRequest, resetFromRequest } from "@/lib/passwordHelp";
import { ADMINS } from "@/lib/types";

/** POST { action: "reset" | "dismiss" }. A reset returns the temporary password, shown to the administrator once. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireApiUser(ADMINS);
    const { id } = await params;
    const { action } = (await req.json().catch(() => ({}))) as { action?: unknown };
    if (action === "reset") {
      const { password, user } = await mutateDb((db) => resetFromRequest(db, admin, id));
      return Response.json({ password, name: user.name, signInWith: user.email || user.phone || "" });
    }
    if (action === "dismiss") {
      await mutateDb((db) => dismissRequest(db, admin, id));
      return Response.json({ ok: true });
    }
    throw new HttpError(400, "Choose reset or dismiss");
  } catch (err) {
    return errorResponse(err);
  }
}
