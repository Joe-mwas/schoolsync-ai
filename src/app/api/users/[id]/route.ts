import { errorResponse, requireApiUser, toPublic } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { deletePerson, updatePerson, type PersonInput } from "@/lib/users";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    await requireApiUser(["director"]);
    const { id } = await params;
    const input = (await req.json().catch(() => ({}))) as PersonInput;
    const user = await mutateDb((db) => updatePerson(db, id, input));
    return Response.json({ user: toPublic(user) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const actor = await requireApiUser(["director"]);
    const { id } = await params;
    await mutateDb((db) => deletePerson(db, actor.id, id));
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
