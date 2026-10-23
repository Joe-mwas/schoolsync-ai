import { logActivity } from "@/lib/activity";
import { gzipSync } from "node:zlib";
import { errorResponse, requireApiUser } from "@/lib/auth";
import { backupIsEncrypted, readSnapshot } from "@/lib/backup";
import { seal } from "@/lib/dataCrypto";
import { backupDirectory, readDb } from "@/lib/db";
import { ADMINS } from "@/lib/types";

/** GET ?name=<snapshot> downloads that backup; without a name, the current data. */
export async function GET(req: Request) {
  try {
    const me = await requireApiUser(ADMINS);
    const name = new URL(req.url).searchParams.get("name");
    // Downloads stay encrypted when encryption is on: only this app (with its key) can restore them.
    const body = name ? await readSnapshot(backupDirectory(), name) : seal(gzipSync(JSON.stringify(await readDb())));
    const filename = `${name ?? `schoolsync-${new Date().toISOString().slice(0, 10)}_current.json.gz`}${backupIsEncrypted(body) ? ".enc" : ""}`;
    await logActivity(req, me, "data", "Downloaded a backup", name ?? "Current data");
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": backupIsEncrypted(body) ? "application/octet-stream" : "application/gzip",
        "Content-Disposition": `attachment; filename="schoolsync-backup-${filename.replace(/^schoolsync-/, "")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
