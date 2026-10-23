import { logActivity } from "@/lib/activity";
import { errorResponse, requireApiUser, toPublic } from "@/lib/auth";
import { mutateDb, newId } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/permissions";
import { assertCanManage, createPerson, type PersonInput } from "@/lib/users";
import { PEOPLE_MANAGERS } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const actor = await requireApiUser(PEOPLE_MANAGERS);
    const input = (await req.json().catch(() => ({}))) as PersonInput & { classId?: string; childId?: string };
    assertCanManage(actor, { role: input.role as string });
    // The add-person form sends a single class/child.
    const user = await mutateDb((db) =>
      createPerson(
        db,
        {
          ...input,
          classIds: input.classIds ?? (input.classId ? [input.classId] : []),
          childIds: input.childIds ?? (input.childId ? [input.childId] : []),
        },
        () => newId("u"),
      ),
    );
    await logActivity(req, actor, "people", "Added a person", `${user.name} (${ROLE_LABELS[user.role]})`);
    return Response.json({ user: toPublic(user) }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
