import { errorResponse, requireApiUser } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { updateProfile, type ProfileInput } from "@/lib/schoolProfile";
import { ADMINS } from "@/lib/types";

/** PUT the school's details (name, motto, website, contacts). */
export async function PUT(req: Request) {
  try {
    await requireApiUser(ADMINS);
    const input = (await req.json().catch(() => ({}))) as ProfileInput;
    return Response.json({ profile: await mutateDb((db) => updateProfile(db, input)) });
  } catch (err) {
    return errorResponse(err);
  }
}
