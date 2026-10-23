import { logActivity } from "@/lib/activity";
import { errorResponse, requireApiUser } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { updateProfile, type ProfileInput } from "@/lib/schoolProfile";
import { ADMINS } from "@/lib/types";

/** PUT the school's details (name, motto, website, contacts). */
export async function PUT(req: Request) {
  try {
    const me = await requireApiUser(ADMINS);
    const input = (await req.json().catch(() => ({}))) as ProfileInput;
    const profile = await mutateDb((db) => updateProfile(db, input));
    await logActivity(req, me, "settings", "Updated the school details");
    return Response.json({ profile });
  } catch (err) {
    return errorResponse(err);
  }
}
