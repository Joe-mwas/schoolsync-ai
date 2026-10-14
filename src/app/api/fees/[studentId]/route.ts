import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { feeStatement } from "@/lib/fees";
import { isOffice } from "@/lib/types";

/** GET: one learner's statement, for leaders or that learner's parent. */
export async function GET(_req: Request, { params }: { params: Promise<{ studentId: string }> }) {
  try {
    const user = await requireApiUser();
    const { studentId } = await params;
    if (!isOffice(user.role) && !(user.role === "parent" && user.childIds.includes(studentId))) throw new HttpError(403, "Not allowed");
    const db = await readDb();
    const student = db.users.find((u) => u.id === studentId && u.role === "student");
    if (!student) throw new HttpError(404, "Learner not found");
    return Response.json({ student: { id: student.id, name: student.name }, statement: feeStatement(db, studentId) });
  } catch (err) {
    return errorResponse(err);
  }
}
