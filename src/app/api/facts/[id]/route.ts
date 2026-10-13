import { errorResponse, requireApiUser } from "@/lib/auth";
import { dataFile, mutateDb } from "@/lib/db";
import { deleteFactImage } from "@/lib/factImages";
import { deleteFact, updateFact, type FactInput } from "@/lib/facts";
import { LEADERS } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const user = await requireApiUser(LEADERS);
    const { id } = await params;
    const input = (await req.json().catch(() => ({}))) as FactInput;
    return Response.json({ fact: await mutateDb((db) => updateFact(db, user, id, input)) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    await requireApiUser(LEADERS);
    const { id } = await params;
    const fact = await mutateDb((db) => deleteFact(db, id));
    await deleteFactImage(dataFile(), fact.image);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
