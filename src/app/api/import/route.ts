import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { mutateDb, newId, readDb, snapshotDb } from "@/lib/db";
import { runImport } from "@/lib/importer";
import { generateTemporaryPassword, hashPassword, hashPasswordAsync } from "@/lib/password";
import { PEOPLE_MANAGERS } from "@/lib/types";

const MAX_CSV_CHARS = 1_000_000;

/**
 * POST { csv, dryRun }. A dry run previews on a copy of the data. A real
 * import previews first to count new accounts, hashes their temporary
 * passwords in parallel off the request thread, then applies atomically.
 */
export async function POST(req: Request) {
  try {
    await requireApiUser(PEOPLE_MANAGERS);
    const { csv, dryRun } = (await req.json().catch(() => ({}))) as { csv?: string; dryRun?: boolean };
    if (typeof csv !== "string" || !csv.trim()) throw new HttpError(400, "Choose a CSV file to import");
    if (csv.length > MAX_CSV_CHARS) throw new HttpError(400, "That file is too large; split it into smaller files");

    let needed = 0;
    const preview = runImport(structuredClone(await readDb()), csv, {
      newId,
      credentials: () => {
        needed++;
        return "dry-run";
      },
    });
    if (dryRun) return Response.json(preview, { headers: { "Cache-Control": "no-store" } });

    // A restore point in case the import isn't what was wanted.
    if (needed > 0 || preview.summary.newClasses > 0 || preview.summary.linkedParents > 0) await snapshotDb("before-import");

    const pool = await Promise.all(
      Array.from({ length: needed }, async () => {
        const password = generateTemporaryPassword();
        return { password, hash: await hashPasswordAsync(password) };
      }),
    );
    const report = await mutateDb((db) =>
      runImport(db, csv, {
        newId,
        // Data can change between preview and apply; fall back to hashing inline.
        credentials: () => {
          const ready = pool.pop();
          if (ready) return ready;
          const password = generateTemporaryPassword();
          return { password, hash: hashPassword(password) };
        },
      }),
    );
    return Response.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
