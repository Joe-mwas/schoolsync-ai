import { aiConfigured, draftAnnouncement } from "@/lib/ai";
import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { logAiExchange } from "@/lib/aiLog";
import { readDb } from "@/lib/db";
import { STAFF } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const user = await requireApiUser(STAFF);
    if (!aiConfigured()) throw new HttpError(503, "AI is not configured. Set ANTHROPIC_API_KEY.");
    const { notes } = (await req.json().catch(() => ({}))) as { notes?: string };
    if (!notes?.trim()) throw new HttpError(400, "Write a few notes for the assistant to work from");
    const draft = await draftAnnouncement(user, await readDb(), notes.trim());
    await logAiExchange("draft", user.id, notes.trim(), `${draft.title}\n\n${draft.body}`);
    return Response.json(draft);
  } catch (err) {
    return errorResponse(err);
  }
}
