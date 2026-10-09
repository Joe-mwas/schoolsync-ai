import type Anthropic from "@anthropic-ai/sdk";
import { aiConfigured, streamAssistantReply } from "@/lib/ai";
import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { readDb } from "@/lib/db";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const MAX_TURNS = 40;

export async function POST(req: Request) {
  try {
    const user = await requireApiUser();
    if (!aiConfigured()) throw new HttpError(503, "AI is not configured. Set ANTHROPIC_API_KEY.");

    const { messages } = (await req.json().catch(() => ({}))) as { messages?: ChatTurn[] };
    const history: Anthropic.Beta.BetaMessageParam[] = (messages ?? [])
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .slice(-MAX_TURNS)
      .map((m) => ({ role: m.role, content: m.content }));
    // The conversation must start with a user turn and end with one.
    while (history.length && history[0].role !== "user") history.shift();
    if (!history.length || history[history.length - 1].role !== "user") {
      throw new HttpError(400, "Send a message to the assistant");
    }

    const db = await readDb();
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of streamAssistantReply(user, db, history)) {
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (err) {
          console.error("assistant stream failed", err);
          controller.enqueue(encoder.encode("\n\n[The assistant hit an error. Please try again.]"));
        } finally {
          controller.close();
        }
      },
    });
    return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
