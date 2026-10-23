import { logActivity } from "@/lib/activity";
import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { assertCanManage, setPassword } from "@/lib/users";
import { PEOPLE_MANAGERS } from "@/lib/types";

/** Director sets a temporary password; the person must change it at next sign-in. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireApiUser(PEOPLE_MANAGERS);
    const { id } = await params;
    if (id === actor.id) throw new HttpError(400, "Change your own password from My account");
    const { password } = (await req.json().catch(() => ({}))) as { password?: string };
    const target = await mutateDb((db) => {
      const user = db.users.find((u) => u.id === id);
      if (!user) throw new HttpError(404, "Person not found");
      assertCanManage(actor, user);
      const hadTwoStep = Boolean(user.twoStep);
      setPassword(user, password ?? "", { mustChange: true });
      return { name: user.name, hadTwoStep };
    });
    await logActivity(req, actor, "security", "Reset a password", `${target.name}${target.hadTwoStep ? " · two-step sign-in turned off" : ""}`);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
