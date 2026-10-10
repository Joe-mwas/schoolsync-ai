import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { mutateDb } from "@/lib/db";

/** PATCH { flagged?, note?, reviewed? }: the administrator's verdict on one AI answer. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiUser(["admin"]);
    const { id } = await params;
    const input = (await req.json().catch(() => ({}))) as { flagged?: unknown; note?: unknown; reviewed?: unknown };
    const entry = await mutateDb((db) => {
      const e = db.aiLogs.find((l) => l.id === id);
      if (!e) throw new HttpError(404, "Conversation not found");
      if (typeof input.flagged === "boolean") {
        e.flagged = input.flagged;
        if (!input.flagged) e.note = null;
      }
      if (typeof input.note === "string") e.note = input.note.trim().slice(0, 1000) || null;
      // Flagging or unflagging is itself a review.
      if (typeof input.reviewed === "boolean" || typeof input.flagged === "boolean") {
        e.reviewedAt = input.reviewed === false ? null : new Date().toISOString();
      }
      return e;
    });
    return Response.json({ entry });
  } catch (err) {
    return errorResponse(err);
  }
}
