import { logActivity } from "@/lib/activity";
import { decideAction } from "@/lib/adminAi/actions";
import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

/** POST { decision: "approve" | "reject" } on a change the admin AI proposed. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const admin = await requireApiUser(["admin"]);
    const { id } = await params;
    const { decision } = (await req.json().catch(() => ({}))) as { decision?: string };
    if (decision !== "approve" && decision !== "reject") throw new HttpError(400, "Choose approve or reject");
    const outcome = await decideAction(id, admin, decision === "approve");
    await logActivity(req, admin, "settings", decision === "approve" ? "Approved an Admin AI change" : "Rejected an Admin AI change", `${outcome.action.summary}${outcome.action.status === "failed" ? " (failed)" : ""}`);
    return Response.json(outcome, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
