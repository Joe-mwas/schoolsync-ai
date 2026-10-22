import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { mutateDb } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH { status: "new" | "sent" | "done" } */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    await requireApiUser(["admin"]);
    const { id } = await params;
    const { status } = (await req.json().catch(() => ({}))) as { status?: string };
    if (status !== "new" && status !== "sent" && status !== "done") throw new HttpError(400, "Unknown status");
    const fr = await mutateDb((db) => {
      const f = db.featureRequests.find((x) => x.id === id);
      if (!f) throw new HttpError(404, "Feature request not found");
      f.status = status;
      return f;
    });
    return Response.json({ featureRequest: fr });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    await requireApiUser(["admin"]);
    const { id } = await params;
    await mutateDb((db) => {
      const i = db.featureRequests.findIndex((x) => x.id === id);
      if (i === -1) throw new HttpError(404, "Feature request not found");
      db.featureRequests.splice(i, 1);
    });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
