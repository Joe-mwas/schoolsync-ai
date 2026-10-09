import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { canManageAnnouncement } from "@/lib/permissions";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { id } = await params;
    await mutateDb((db) => {
      const idx = db.announcements.findIndex((a) => a.id === id);
      if (idx === -1) throw new HttpError(404, "Announcement not found");
      if (!canManageAnnouncement(user, db.announcements[idx])) throw new HttpError(403, "Not allowed");
      db.announcements.splice(idx, 1);
    });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
