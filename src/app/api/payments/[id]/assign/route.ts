import { logActivity } from "@/lib/activity";
import { errorResponse, requireApiUser } from "@/lib/auth";
import { assignAndNotify } from "@/lib/payments";
import { OFFICE } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/** Link an unmatched M-Pesa payment to a learner, record it and send the receipt. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const user = await requireApiUser(OFFICE);
    const { id } = await params;
    const { studentId } = (await req.json().catch(() => ({}))) as { studentId?: unknown };
    const payment = await assignAndNotify(user, id, studentId);
    await logActivity(req, user, "fees", "Matched an M-Pesa payment to a learner", `${payment.transId}: Ksh ${Number(payment.amount).toLocaleString("en-KE")}`);
    return Response.json({ payment });
  } catch (err) {
    return errorResponse(err);
  }
}
