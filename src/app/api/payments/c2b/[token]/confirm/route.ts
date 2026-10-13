import { HttpError } from "@/lib/auth";
import { darajaConfig, validCallbackToken } from "@/lib/daraja";
import { parseConfirmation } from "@/lib/mpesa";
import { handleMpesaPayment } from "@/lib/payments";

type Ctx = { params: Promise<{ token: string }> };

/** Safaricom's C2B confirmation: a completed payment to the school's Paybill. */
export async function POST(req: Request, { params }: Ctx) {
  const { token } = await params;
  if (!validCallbackToken(token)) return new Response("Not found", { status: 404 });
  try {
    const confirmation = parseConfirmation(await req.json().catch(() => null));
    const shortCode = darajaConfig().shortCode;
    if (confirmation.shortCode && shortCode && confirmation.shortCode !== shortCode) {
      throw new HttpError(400, `Payment is for short code ${confirmation.shortCode}, not ${shortCode}`);
    }
    const outcome = await handleMpesaPayment(confirmation);
    console.log(`M-Pesa ${confirmation.transId}: ${outcome.kind}`);
    return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("M-Pesa confirmation rejected:", message);
    return Response.json({ ResultCode: 1, ResultDesc: "Rejected" }, { status: err instanceof HttpError ? 400 : 500 });
  }
}
