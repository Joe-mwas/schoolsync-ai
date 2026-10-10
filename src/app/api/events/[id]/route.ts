import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { LEADERS } from "@/lib/types";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiUser(LEADERS);
    const { id } = await params;
    await mutateDb((db) => {
      const idx = db.events.findIndex((e) => e.id === id);
      if (idx === -1) throw new HttpError(404, "Event not found");
      db.events.splice(idx, 1);
    });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
