import { errorResponse, requireApiUser } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { deleteAssignment, setAssignmentDone } from "@/lib/assignments";
import { ASSIGNMENT_SETTERS } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH { done: boolean }: a learner ticks their assignment off. */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const actor = await requireApiUser(["student"]);
    const { id } = await params;
    const { done } = (await req.json().catch(() => ({}))) as { done?: unknown };
    const a = await mutateDb((db) => setAssignmentDone(db, actor, id, done));
    return Response.json({ done: a.doneBy.includes(actor.id) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const actor = await requireApiUser(ASSIGNMENT_SETTERS);
    const { id } = await params;
    await mutateDb((db) => deleteAssignment(db, actor, id));
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
