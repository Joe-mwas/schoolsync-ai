import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { mutateDb } from "@/lib/db";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["director", "teacher"]);
    const { id } = await params;
    await mutateDb((db) => {
      const idx = db.posters.findIndex((p) => p.id === id);
      if (idx === -1) throw new HttpError(404, "Poster not found");
      if (db.posters[idx].authorId !== user.id && user.role !== "director") throw new HttpError(403, "Not allowed");
      db.posters.splice(idx, 1);
      for (const a of db.announcements) if (a.posterId === id) a.posterId = null;
    });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
