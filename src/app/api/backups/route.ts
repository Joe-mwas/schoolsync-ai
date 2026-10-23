import { logActivity } from "@/lib/activity";
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
export async function POST(req: Request) {
  try {
    const me = await requireApiUser(ADMINS);
    const snapshot = await snapshotDb("manual");
    await logActivity(req, me, "data", "Made a backup");
    return Response.json({ snapshot }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
