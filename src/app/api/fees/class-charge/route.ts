import { logActivity } from "@/lib/activity";
import { errorResponse, requireApiUser } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { setClassCharge } from "@/lib/fees";
import { OFFICE } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const user = await requireApiUser(OFFICE);
    const input = (await req.json().catch(() => ({}))) as Parameters<typeof setClassCharge>[2];
    const result = await mutateDb((db) => ({ ...setClassCharge(db, user, input), className: db.classes.find((c) => c.id === input.classId)?.name ?? "" }));
    await logActivity(req, user, "fees", "Set the term fee for a class", `${result.className}: Ksh ${Number(input.amount).toLocaleString("en-KE")} for ${result.learners} learners${input.term ? ` (${String(input.term)})` : ""}`);
    const { className: _name, ...rest } = result;
    return Response.json(rest);
  } catch (err) {
    return errorResponse(err);
  }
}
