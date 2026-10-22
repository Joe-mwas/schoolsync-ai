import { errorResponse, requireApiUser } from "@/lib/auth";
import { listSnapshots } from "@/lib/backup";
import { backupDirectory, snapshotDb } from "@/lib/db";
import { ADMINS } from "@/lib/types";

export async function GET() {
  try {
    await requireApiUser(ADMINS);
    return Response.json({ snapshots: await listSnapshots(backupDirectory()) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Back up now. */
export async function POST() {
  try {
    await requireApiUser(ADMINS);
    return Response.json({ snapshot: await snapshotDb("manual") }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
