import { errorResponse, HttpError, requireApiUser, toPublic } from "@/lib/auth";
import { mutateDb, newId } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { ROLES, type Role, type User } from "@/lib/types";

export async function POST(req: Request) {
  try {
    await requireApiUser(["director"]);
    const input = (await req.json().catch(() => ({}))) as {
      name?: string; email?: string; role?: string; phone?: string; password?: string; classId?: string; childId?: string;
    };
    const name = input.name?.trim();
    const email = input.email?.trim().toLowerCase();
    if (!name || !email || !input.password) throw new HttpError(400, "Name, email and password are required");
    if (input.password.length < 8) throw new HttpError(400, "Password must be at least 8 characters");
    if (!(ROLES as readonly string[]).includes(input.role ?? "")) throw new HttpError(400, "Invalid role");
    const role = input.role as Role;

    const user = await mutateDb((db) => {
      if (db.users.some((u) => u.email.toLowerCase() === email)) throw new HttpError(409, "Email already in use");
      if (input.classId && !db.classes.some((c) => c.id === input.classId)) throw new HttpError(400, "Unknown class");
      if (input.childId && !db.users.some((u) => u.id === input.childId && u.role === "student")) {
        throw new HttpError(400, "Unknown student");
      }
      const created: User = {
        id: newId("u"),
        name,
        email,
        role,
        passwordHash: hashPassword(input.password!),
        phone: input.phone?.trim() || undefined,
        classIds: (role === "teacher" || role === "student") && input.classId ? [input.classId] : [],
        childIds: role === "parent" && input.childId ? [input.childId] : [],
      };
      db.users.push(created);
      if (role === "teacher" && input.classId) {
        const cls = db.classes.find((c) => c.id === input.classId);
        if (cls && !cls.teacherId) cls.teacherId = created.id;
      }
      return created;
    });
    return Response.json({ user: toPublic(user) }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
