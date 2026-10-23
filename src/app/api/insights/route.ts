import { assertAiAllowed } from "@/lib/aiBudget";
import { aiConfigured, generateInsights } from "@/lib/ai";
import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { mutateDb, readDb } from "@/lib/db";
import { factsKey, insightFacts, insightScope, insightsFresh } from "@/lib/insights";
import { SCHOOL_WIDE, type SavedInsights } from "@/lib/types";

/** POST { refresh? } → the insights for this person's dashboard: saved ones while the figures are unchanged, else freshly written. */
export async function POST(req: Request) {
  try {
    const user = await requireApiUser(SCHOOL_WIDE);
    const scope = insightScope(user.role);
    if (!scope) throw new HttpError(403, "Not available for this role");
    const { refresh } = (await req.json().catch(() => ({}))) as { refresh?: unknown };
    const db = await readDb();
    const facts = insightFacts(db, scope);
    if (!facts) throw new HttpError(400, "There aren't any results or fees to read yet.");
    const saved = db.insights[scope];
    if (refresh !== true && saved && insightsFresh(saved, facts)) return Response.json({ insights: saved });
    if (!aiConfigured()) throw new HttpError(400, "Connect Claude first (Setup → Connections & security).");
    await assertAiAllowed();
    let fresh: SavedInsights;
    try {
      fresh = { ...(await generateInsights(facts)), factsKey: factsKey(facts), generatedAt: new Date().toISOString() };
    } catch (err) {
      console.error("AI insights failed", err);
      throw new HttpError(502, "The AI couldn't read the figures just now. Try again in a minute.");
    }
    await mutateDb((d) => void (d.insights[scope] = fresh));
    return Response.json({ insights: fresh });
  } catch (err) {
    return errorResponse(err);
  }
}
