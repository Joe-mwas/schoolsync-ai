import { errorResponse, requireApiUser } from "@/lib/auth";
import { assignAndNotify } from "@/lib/payments";
import { LEADERS } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/** Link an unmatched M-Pesa payment to a learner, record it and send the receipt. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const user = await requireApiUser(LEADERS);
    const { id } = await params;
    const { studentId } = (await req.json().catch(() => ({}))) as { studentId?: unknown };
    return Response.json({ payment: await assignAndNotify(user, id, studentId) });
  } catch (err) {
    return errorResponse(err);
  }
}
