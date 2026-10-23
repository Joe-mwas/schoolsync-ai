import { alertAssignment } from "@/lib/alerts";
import { errorResponse, requireApiUser } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { createAssignment, type AssignmentInput } from "@/lib/assignments";
import { ASSIGNMENT_SETTERS } from "@/lib/types";

/** Set an assignment or revision work for one or more classes. */
export async function POST(req: Request) {
  try {
    const actor = await requireApiUser(ASSIGNMENT_SETTERS);
    const input = (await req.json().catch(() => ({}))) as AssignmentInput;
    const assignment = await mutateDb((db) => createAssignment(db, actor, input));
    void alertAssignment(assignment);
    return Response.json({ assignment }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
