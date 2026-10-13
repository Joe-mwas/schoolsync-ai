import { errorResponse, requireApiUser } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { ignoreMpesaPayment } from "@/lib/mpesa";
import { OFFICE } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/** Not a fee payment: remove it from the "needs matching" list. */
export async function POST(_req: Request, { params }: Ctx) {
  try {
    await requireApiUser(OFFICE);
    const { id } = await params;
    return Response.json({ payment: await mutateDb((db) => ignoreMpesaPayment(db, id)) });
  } catch (err) {
    return errorResponse(err);
  }
}
