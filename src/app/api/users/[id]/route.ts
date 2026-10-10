import { errorResponse, requireApiUser, toPublic } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { assertCanManage, deletePerson, updatePerson, type PersonInput } from "@/lib/users";
import { LEADERS } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const actor = await requireApiUser(LEADERS);
    const { id } = await params;
    const input = (await req.json().catch(() => ({}))) as PersonInput;
    const user = await mutateDb((db) => {
      assertCanManage(actor, db.users.find((u) => u.id === id) ?? { role: undefined });
      return updatePerson(db, id, input);
    });
    return Response.json({ user: toPublic(user) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const actor = await requireApiUser(LEADERS);
    const { id } = await params;
    await mutateDb((db) => {
      assertCanManage(actor, db.users.find((u) => u.id === id) ?? { role: undefined });
      deletePerson(db, actor.id, id);
    });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
