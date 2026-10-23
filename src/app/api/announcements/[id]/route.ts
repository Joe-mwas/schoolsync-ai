import { logActivity } from "@/lib/activity";
import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { canManageAnnouncement } from "@/lib/permissions";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { id } = await params;
    const title = await mutateDb((db) => {
      const idx = db.announcements.findIndex((a) => a.id === id);
      if (idx === -1) throw new HttpError(404, "Announcement not found");
      if (!canManageAnnouncement(user, db.announcements[idx])) throw new HttpError(403, "Not allowed");
      return db.announcements.splice(idx, 1)[0].title;
    });
    await logActivity(req, user, "messages", "Deleted an announcement", title);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
