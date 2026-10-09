import { aiConfigured, draftAnnouncement } from "@/lib/ai";
import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { readDb } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const user = await requireApiUser(["director", "teacher"]);
    if (!aiConfigured()) throw new HttpError(503, "AI is not configured. Set ANTHROPIC_API_KEY.");
    const { notes } = (await req.json().catch(() => ({}))) as { notes?: string };
    if (!notes?.trim()) throw new HttpError(400, "Write a few notes for the assistant to work from");
    return Response.json(await draftAnnouncement(user, await readDb(), notes.trim()));
  } catch (err) {
    return errorResponse(err);
  }
}
