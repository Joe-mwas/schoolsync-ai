import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { broadcastAnnouncement } from "@/lib/broadcast";
import { readDb } from "@/lib/db";
import { canManageAnnouncement } from "@/lib/permissions";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["director", "teacher"]);
    const { id } = await params;
    const a = (await readDb()).announcements.find((x) => x.id === id);
    if (!a) throw new HttpError(404, "Announcement not found");
    if (!canManageAnnouncement(user, a)) throw new HttpError(403, "Not allowed");
    return Response.json(await broadcastAnnouncement(id));
  } catch (err) {
    return errorResponse(err);
  }
}
