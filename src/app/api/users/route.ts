import { errorResponse, requireApiUser, toPublic } from "@/lib/auth";
import { mutateDb, newId } from "@/lib/db";
import { createPerson, type PersonInput } from "@/lib/users";

export async function POST(req: Request) {
  try {
    await requireApiUser(["director"]);
    const input = (await req.json().catch(() => ({}))) as PersonInput & { classId?: string; childId?: string };
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
    return Response.json({ user: toPublic(user) }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
