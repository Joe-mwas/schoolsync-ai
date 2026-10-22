import { errorResponse, requireApiUser } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { deleteDuty, setDutyStatus } from "@/lib/duties";
import { DUTY_MANAGERS } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH { status: "open" | "done" }: the assigned teacher (or a manager). */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const actor = await requireApiUser([...DUTY_MANAGERS, "teacher"]);
    const { id } = await params;
    const { status } = (await req.json().catch(() => ({}))) as { status?: unknown };
    return Response.json({ duty: await mutateDb((db) => setDutyStatus(db, actor, id, status)) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const actor = await requireApiUser(DUTY_MANAGERS);
    const { id } = await params;
    await mutateDb((db) => deleteDuty(db, actor, id));
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
