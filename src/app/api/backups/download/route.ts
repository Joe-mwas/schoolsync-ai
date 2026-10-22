import { gzipSync } from "node:zlib";
import { errorResponse, requireApiUser } from "@/lib/auth";
import { readSnapshot } from "@/lib/backup";
import { backupDirectory, readDb } from "@/lib/db";
import { ADMINS } from "@/lib/types";

/** GET ?name=<snapshot> downloads that backup; without a name, the current data. */
export async function GET(req: Request) {
  try {
    await requireApiUser(ADMINS);
    const name = new URL(req.url).searchParams.get("name");
    const body = name ? await readSnapshot(backupDirectory(), name) : gzipSync(JSON.stringify(await readDb()));
    const filename = name ?? `schoolsync-${new Date().toISOString().slice(0, 10)}_current.json.gz`;
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="schoolsync-backup-${filename.replace(/^schoolsync-/, "")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
