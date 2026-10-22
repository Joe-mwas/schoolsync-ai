import { schoolName } from "@/lib/ai";
import { errorResponse, requireApiUser } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { createDuty, dutyMessage, type DutyInput } from "@/lib/duties";
import { notifyPerson } from "@/lib/notify";
import { DUTY_MANAGERS } from "@/lib/types";

/** Assign a duty; each teacher gets it on WhatsApp too. */
export async function POST(req: Request) {
  try {
    const actor = await requireApiUser(DUTY_MANAGERS);
    const input = (await req.json().catch(() => ({}))) as DutyInput;
    const { duty, teachers } = await mutateDb((db) => {
      const d = createDuty(db, actor, input);
      return { duty: d, teachers: db.users.filter((u) => d.teacherIds.includes(u.id)) };
    });
    let notified = 0;
    for (const t of teachers) {
      if (!t.phone) continue;
      const m = await notifyPerson(t, `New duty: ${duty.title}`, dutyMessage(duty, t, actor, schoolName()), "duty").catch(() => null);
      if (m && m.status !== "failed") notified++;
    }
    return Response.json({ duty, notified, withoutWhatsApp: teachers.filter((t) => !t.phone).map((t) => t.name) }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
