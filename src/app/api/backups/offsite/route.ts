import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { offsiteBackupNow } from "@/lib/offsiteJob";
import { ADMINS } from "@/lib/types";

/** Upload an encrypted off-site copy now (also tests the storage settings). */
export async function POST() {
  try {
    await requireApiUser(ADMINS);
    try {
      return Response.json({ status: await offsiteBackupNow() });
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(400, err instanceof Error ? err.message : "Off-site backup failed");
    }
  } catch (err) {
    return errorResponse(err);
  }
}
