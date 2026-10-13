import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { parseAmount } from "@/lib/fees";
import { handleMpesaPayment } from "@/lib/payments";
import { OFFICE } from "@/lib/types";

/** Try the whole flow (matching, ledger, WhatsApp receipt) with a pretend payment. */
export async function POST(req: Request) {
  try {
    await requireApiUser(OFFICE);
    const b = (await req.json().catch(() => ({}))) as { amount?: unknown; account?: unknown; payerName?: unknown; phone?: unknown };
    const amount = parseAmount(b.amount);
    if (!amount) throw new HttpError(400, "Enter an amount greater than zero");
    const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
    const outcome = await handleMpesaPayment(
      {
        transId: `TEST${crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`,
        amount,
        account: text(b.account, 40),
        payerName: text(b.payerName, 80) || "Test Payer",
        phone: text(b.phone, 20),
        shortCode: "",
        paidAt: new Date().toISOString(),
      },
      { test: true },
    );
    return Response.json({ outcome: outcome.kind, payment: outcome.payment });
  } catch (err) {
    return errorResponse(err);
  }
}
