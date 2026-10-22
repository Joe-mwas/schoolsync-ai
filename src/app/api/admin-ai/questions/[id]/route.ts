import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { mutateDb } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH { status: "open" | "answered" } on a question a director forwarded. */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    await requireApiUser(["admin"]);
    const { id } = await params;
    const { status } = (await req.json().catch(() => ({}))) as { status?: string };
    if (status !== "open" && status !== "answered") throw new HttpError(400, "Unknown status");
    const question = await mutateDb((db) => {
      const q = db.forwardedQuestions.find((x) => x.id === id);
      if (!q) throw new HttpError(404, "Question not found");
      q.status = status;
      q.answeredAt = status === "answered" ? new Date().toISOString() : null;
      return q;
    });
    return Response.json({ question });
  } catch (err) {
    return errorResponse(err);
  }
}
