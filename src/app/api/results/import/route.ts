import { alertResults } from "@/lib/alerts";
import { logActivity } from "@/lib/activity";
import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { mutateDb, readDb } from "@/lib/db";
import { importResults, setExamInfo } from "@/lib/results";
import { STAFF } from "@/lib/types";

/** POST { csv, exam, dryRun }: preview on a copy, or import. */
export async function POST(req: Request) {
  try {
    const user = await requireApiUser(STAFF);
    const { csv, exam, dryRun, type, outOf } = (await req.json().catch(() => ({}))) as { csv?: string; exam?: string; dryRun?: boolean; type?: unknown; outOf?: unknown };
    if (typeof csv !== "string" || !csv.trim()) throw new HttpError(400, "Choose a CSV file");
    if (csv.length > 1_000_000) throw new HttpError(400, "That file is too large");
    if (!exam?.trim()) throw new HttpError(400, "Name the exam or assessment first");
    // The exam's type and marks, as chosen above the upload, apply to the file.
    const run = (db: Parameters<typeof importResults>[0]) => {
      if (user.role !== "secretary" && (type !== undefined || outOf !== undefined)) setExamInfo(db, exam, { type, outOf });
      return importResults(db, user, csv, exam);
    };
    const report = dryRun ? run(structuredClone(await readDb())) : await mutateDb(run);
    if (!dryRun && report.saved > 0) {
      const db = await readDb();
      const name = exam.trim().toLowerCase();
      void alertResults(db.results.filter((r) => r.exam.toLowerCase() === name && r.updatedBy === user.id && Date.now() - Date.parse(r.updatedAt) < 60_000).map((r) => r.studentId), exam.trim());
    }
    if (!dryRun) await logActivity(req, user, "results", "Imported results from a file", `${exam.trim()}: ${report.saved} saved${report.errors ? `, ${report.errors} rows with problems` : ""}`);
    return Response.json(report);
  } catch (err) {
    return errorResponse(err);
  }
}
