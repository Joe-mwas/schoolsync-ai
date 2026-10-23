import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { ADMINS, type FamilyModel } from "@/lib/types";

/** PUT { familyModel } — which model answers parents and learners. */
export async function PUT(req: Request) {
  try {
    await requireApiUser(ADMINS);
    const { familyModel } = (await req.json().catch(() => ({}))) as { familyModel?: unknown };
    if (familyModel !== "economy" && familyModel !== "balanced" && familyModel !== "top") throw new HttpError(400, "Choose economy, balanced or top");
    await mutateDb((db) => void (db.aiSettings = { ...db.aiSettings, familyModel: familyModel as FamilyModel }));
    return Response.json({ familyModel });
  } catch (err) {
    return errorResponse(err);
  }
}
