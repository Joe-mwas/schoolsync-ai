import { aiConfigured } from "@/lib/ai";
import { runAdminTurn, type ChatTurn } from "@/lib/adminAi/agent";
import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";

/**
 * POST { history: [{ role, text }] } → the AI's answer. The administrator gets
 * the full Admin AI; a director gets the School AI (school and families only).
 */
export async function POST(req: Request) {
  try {
    const user = await requireApiUser(["admin", "director"]);
    if (!aiConfigured()) throw new HttpError(400, "Connect Claude first: set ANTHROPIC_API_KEY (see the Setup page).");
    const { history } = (await req.json().catch(() => ({}))) as { history?: ChatTurn[] };
    if (!Array.isArray(history)) throw new HttpError(400, "Ask a question first");
    const clean = history
      .filter((t) => (t?.role === "user" || t?.role === "assistant") && typeof t.text === "string")
      .map((t) => ({ role: t.role, text: t.text }));
    return Response.json(await runAdminTurn(user, clean));
  } catch (err) {
    return errorResponse(err);
  }
}
