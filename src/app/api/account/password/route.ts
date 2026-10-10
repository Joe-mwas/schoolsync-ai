import { errorResponse, HttpError, requireApiUser, setSessionCookie } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { setPassword } from "@/lib/users";

export async function POST(req: Request) {
  try {
    const me = await requireApiUser(undefined, { allowPendingPasswordChange: true });
    const { currentPassword, newPassword } = (await req.json().catch(() => ({}))) as {
      currentPassword?: string;
      newPassword?: string;
    };
    if (!currentPassword || !verifyPassword(currentPassword, me.passwordHash)) {
      throw new HttpError(400, "Your current password is incorrect");
    }
    if (newPassword === currentPassword) throw new HttpError(400, "Choose a password different from the current one");
    const user = await mutateDb((db) => {
      const u = db.users.find((x) => x.id === me.id);
      if (!u) throw new HttpError(404, "Account not found");
      setPassword(u, newPassword ?? "", { mustChange: false });
      return u;
    });
    // Other devices are signed out; keep this one signed in.
    await setSessionCookie(user);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
