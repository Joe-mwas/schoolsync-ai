import { logActivity } from "@/lib/activity";
import { errorResponse, requireApiUser } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { deleteFeeEntry } from "@/lib/fees";
import { OFFICE } from "@/lib/types";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(OFFICE);
    const { id } = await params;
    const gone = await mutateDb((db) => {
      const e = db.fees.find((f) => f.id === id);
      deleteFeeEntry(db, id);
      return e ? { ...e, student: db.users.find((u) => u.id === e.studentId)?.name ?? "a learner" } : null;
    });
    if (gone) await logActivity(req, user, "fees", gone.kind === "payment" ? "Deleted a payment" : "Deleted a fee charge", `${gone.student}: Ksh ${gone.amount.toLocaleString("en-KE")} (${gone.term})`);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
