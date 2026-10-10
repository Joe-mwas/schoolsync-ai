import { errorResponse, requireApiUser, toPublic } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { updatePerson } from "@/lib/users";

/** Users can update their own WhatsApp number. */
export async function PATCH(req: Request) {
  try {
    const me = await requireApiUser();
    const { phone } = (await req.json().catch(() => ({}))) as { phone?: string };
    const user = await mutateDb((db) => updatePerson(db, me.id, { phone: phone ?? "" }));
    return Response.json({ user: toPublic(user) });
  } catch (err) {
    return errorResponse(err);
  }
}
