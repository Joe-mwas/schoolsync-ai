import { validCallbackToken } from "@/lib/daraja";

type Ctx = { params: Promise<{ token: string }> };

/**
 * Safaricom's optional validation step (only used if the school asks
 * Safaricom to enable it). Every payment is accepted: an unrecognised
 * account number goes to the bursar to match rather than bouncing the parent.
 */
export async function POST(_req: Request, { params }: Ctx) {
  const { token } = await params;
  if (!validCallbackToken(token)) return new Response("Not found", { status: 404 });
  return Response.json({ ResultCode: "0", ResultDesc: "Accepted" });
}
