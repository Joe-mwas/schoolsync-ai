import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { setPassword } from "@/lib/users";

/** Director sets a temporary password; the person must change it at next sign-in. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireApiUser(["director"]);
    const { id } = await params;
    if (id === actor.id) throw new HttpError(400, "Change your own password from My account");
    const { password } = (await req.json().catch(() => ({}))) as { password?: string };
    await mutateDb((db) => {
      const user = db.users.find((u) => u.id === id);
      if (!user) throw new HttpError(404, "Person not found");
      setPassword(user, password ?? "", { mustChange: true });
    });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
