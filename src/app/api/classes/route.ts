import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { mutateDb, newId } from "@/lib/db";
import type { SchoolClass } from "@/lib/types";

export async function POST(req: Request) {
  try {
    await requireApiUser(["director"]);
    const input = (await req.json().catch(() => ({}))) as { name?: string; teacherId?: string };
    const name = input.name?.trim();
    if (!name) throw new HttpError(400, "Class name is required");

    const cls = await mutateDb((db) => {
      if (db.classes.some((c) => c.name.toLowerCase() === name.toLowerCase())) throw new HttpError(409, "A class with that name exists");
      const teacher = input.teacherId ? db.users.find((u) => u.id === input.teacherId && u.role === "teacher") : null;
      if (input.teacherId && !teacher) throw new HttpError(400, "Unknown teacher");
      const created: SchoolClass = { id: newId("c"), name, teacherId: teacher?.id ?? null };
      db.classes.push(created);
      if (teacher && !teacher.classIds.includes(created.id)) teacher.classIds.push(created.id);
      return created;
    });
    return Response.json({ class: cls }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
