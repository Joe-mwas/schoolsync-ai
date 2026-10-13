import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { mutateDb, readDb } from "@/lib/db";
import { importFees } from "@/lib/fees";
import { OFFICE } from "@/lib/types";

/** POST { csv, dryRun }: preview on a copy, or import. */
export async function POST(req: Request) {
  try {
    const user = await requireApiUser(OFFICE);
    const { csv, dryRun } = (await req.json().catch(() => ({}))) as { csv?: string; dryRun?: boolean };
    if (typeof csv !== "string" || !csv.trim()) throw new HttpError(400, "Choose a CSV file");
    if (csv.length > 1_000_000) throw new HttpError(400, "That file is too large");
    const report = dryRun ? importFees(structuredClone(await readDb()), user, csv) : await mutateDb((db) => importFees(db, user, csv));
    return Response.json(report);
  } catch (err) {
    return errorResponse(err);
  }
}
