import { logActivity } from "@/lib/activity";
import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { SUGGESTED_AREAS } from "@/lib/cbc";
import { mutateDb, readDb } from "@/lib/db";
import { canEditResults, canViewResults, examsFor, saveResults, type GridRow } from "@/lib/results";
import { STAFF } from "@/lib/types";

/** GET ?classId=&exam= : the results grid for one class and exam. */
export async function GET(req: Request) {
  try {
    const user = await requireApiUser(STAFF);
    const url = new URL(req.url);
    const classId = url.searchParams.get("classId") ?? "";
    const db = await readDb();
    if (!db.classes.some((c) => c.id === classId)) throw new HttpError(400, "Choose a class");
    if (!canViewResults(user, classId)) throw new HttpError(403, "You can only see results for your own classes");
    const learners = db.users.filter((u) => u.role === "student" && u.classIds.includes(classId)).sort((a, b) => a.name.localeCompare(b.name));
    const ids = learners.map((l) => l.id);
    const exams = examsFor(db, ids);
    const exam = url.searchParams.get("exam") ?? exams[0] ?? "";
    const rs = db.results.filter((r) => r.exam === exam && ids.includes(r.studentId));
    const recorded = [...new Set(rs.map((r) => r.area))];
    // Areas used in this class before, so a new exam starts with the same columns.
    const classAreas = [...new Set(db.results.filter((r) => ids.includes(r.studentId)).map((r) => r.area))];
    const areas = recorded.length ? recorded : classAreas.length ? classAreas : SUGGESTED_AREAS.slice(0, 5);
    return Response.json({
      canEdit: canEditResults(user, classId),
      exam,
      exams,
      areas,
      students: learners.map((l) => ({
        id: l.id,
        name: l.name,
        levels: Object.fromEntries(rs.filter((r) => r.studentId === l.id).map((r) => [r.area, r.level])),
        comment: db.resultComments.find((c) => c.studentId === l.id && c.exam === exam)?.comment ?? "",
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** PUT { classId, exam, rows }: save the grid. */
export async function PUT(req: Request) {
  try {
    const user = await requireApiUser(STAFF);
    const { classId, exam, rows } = (await req.json().catch(() => ({}))) as { classId?: string; exam?: string; rows?: GridRow[] };
    if (!Array.isArray(rows)) throw new HttpError(400, "Nothing to save");
    const result = await mutateDb((db) => ({ ...saveResults(db, user, classId ?? "", exam ?? "", rows), className: db.classes.find((c) => c.id === classId)?.name ?? "" }));
    await logActivity(req, user, "results", "Saved results", `${result.className}, ${String(exam).trim()}: ${result.saved} learners`);
    const { className: _name, ...saved } = result;
    return Response.json(saved);
  } catch (err) {
    return errorResponse(err);
  }
}
