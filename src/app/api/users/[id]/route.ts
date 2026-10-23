import { logActivity } from "@/lib/activity";
import { errorResponse, requireApiUser, toPublic } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/permissions";
import { assertCanManage, deletePerson, updatePerson, type PersonInput } from "@/lib/users";
import { PEOPLE_MANAGERS } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const actor = await requireApiUser(PEOPLE_MANAGERS);
    const { id } = await params;
    const input = (await req.json().catch(() => ({}))) as PersonInput;
    const { user, before } = await mutateDb((db) => {
      const target = db.users.find((u) => u.id === id);
      assertCanManage(actor, target ?? { role: undefined });
      const before = target ? { role: target.role, name: target.name } : null;
      return { user: updatePerson(db, id, input), before };
    });
    const roleChange = before && before.role !== user.role ? ` · role ${ROLE_LABELS[before.role]} → ${ROLE_LABELS[user.role]}` : "";
    await logActivity(req, actor, "people", "Edited a person", `${user.name}${before && before.name !== user.name ? ` (was ${before.name})` : ""}${roleChange}`);
    return Response.json({ user: toPublic(user) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const actor = await requireApiUser(PEOPLE_MANAGERS);
    const { id } = await params;
    const removed = await mutateDb((db) => {
      const target = db.users.find((u) => u.id === id);
      assertCanManage(actor, target ?? { role: undefined });
      deletePerson(db, actor.id, id);
      return target ? `${target.name} (${ROLE_LABELS[target.role]})` : id;
    });
    await logActivity(req, actor, "people", "Removed a person", removed);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
