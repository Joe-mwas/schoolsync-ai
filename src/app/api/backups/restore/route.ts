import { errorResponse, HttpError, requireApiUser, setSessionCookie } from "@/lib/auth";
import { decodeBackup, readSnapshot } from "@/lib/backup";
import { backupDirectory, replaceDb } from "@/lib/db";
import { LEADERS } from "@/lib/types";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * Restore from a listed snapshot (?name=...) or an uploaded backup file (the
 * request body). The current data is snapshotted first, so a restore can be undone.
 */
export async function POST(req: Request) {
  try {
    const me = await requireApiUser(LEADERS);
    const name = new URL(req.url).searchParams.get("name");
    let raw: Buffer;
    if (name) {
      raw = await readSnapshot(backupDirectory(), name);
    } else {
      const buf = Buffer.from(await req.arrayBuffer());
      if (buf.length === 0) throw new HttpError(400, "Choose a backup file to restore");
      if (buf.length > MAX_UPLOAD_BYTES) throw new HttpError(400, "That file is too large");
      raw = buf;
    }
    const restored = decodeBackup(raw);

    // Don't let a restore lock out the person doing it.
    const self = restored.users.find((u) => u.id === me.id && u.role === me.role);
    if (!self) {
      throw new HttpError(
        400,
        "Your account isn't in that backup, so restoring it would sign you out for good. Ask someone whose account is in the backup to restore it.",
      );
    }
    await replaceDb(restored);
    // The restored account may carry an older session version; keep this browser signed in.
    await setSessionCookie(self);
    return Response.json({ ok: true, people: restored.users.length });
  } catch (err) {
    return errorResponse(err);
  }
}
