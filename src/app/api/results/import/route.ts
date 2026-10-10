import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { mutateDb, readDb } from "@/lib/db";
import { importResults } from "@/lib/results";
import { STAFF } from "@/lib/types";

/** POST { csv, exam, dryRun }: preview on a copy, or import. */
export async function POST(req: Request) {
  try {
    const user = await requireApiUser(STAFF);
    const { csv, exam, dryRun } = (await req.json().catch(() => ({}))) as { csv?: string; exam?: string; dryRun?: boolean };
    if (typeof csv !== "string" || !csv.trim()) throw new HttpError(400, "Choose a CSV file");
    if (csv.length > 1_000_000) throw new HttpError(400, "That file is too large");
    if (!exam?.trim()) throw new HttpError(400, "Name the exam or assessment first");
    const report = dryRun
      ? importResults(structuredClone(await readDb()), user, csv, exam)
      : await mutateDb((db) => importResults(db, user, csv, exam));
    return Response.json(report);
  } catch (err) {
    return errorResponse(err);
  }
}
