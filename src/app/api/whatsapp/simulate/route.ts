import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { handleInboundMessage } from "@/lib/inbound";

/** Lets a director test the inbound flow without a real WhatsApp number. */
export async function POST(req: Request) {
  try {
    await requireApiUser(["director"]);
    const { from, body } = (await req.json().catch(() => ({}))) as { from?: string; body?: string };
    if (!from?.trim() || !body?.trim()) throw new HttpError(400, "Phone number and message are required");
    const reply = await handleInboundMessage(from, body.trim());
    return Response.json({ reply });
  } catch (err) {
    return errorResponse(err);
  }
}
