import { logActivity } from "@/lib/activity";
import { errorResponse, requireApiUser } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { addFeeEntry, type EntryInput } from "@/lib/fees";
import { OFFICE } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const user = await requireApiUser(OFFICE);
    const input = (await req.json().catch(() => ({}))) as EntryInput;
    const { entry, student } = await mutateDb((db) => {
      const e = addFeeEntry(db, user, input);
      return { entry: e, student: db.users.find((u) => u.id === e.studentId)?.name ?? "a learner" };
    });
    await logActivity(req, user, "fees", entry.kind === "payment" ? "Recorded a payment" : "Added a fee charge", `${student}: Ksh ${entry.amount.toLocaleString("en-KE")} (${entry.term})${entry.reference ? ` ref ${entry.reference}` : ""}`);
    return Response.json({ entry }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
