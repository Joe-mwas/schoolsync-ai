import { briefData, writeBrief } from "@/lib/ai";
import { logAiExchange } from "@/lib/aiLog";
import { errorResponse, requireApiUser } from "@/lib/auth";
import { parseBriefPeriod } from "@/lib/brief";
import { mutateDb, readDb } from "@/lib/db";
import { LEADERS } from "@/lib/types";

/** POST { period }: the same brief a leader gets on WhatsApp ("", "today", "this week", "this month"). */
export async function POST(req: Request) {
  try {
    const user = await requireApiUser(LEADERS);
    const { period } = (await req.json().catch(() => ({}))) as { period?: string };
    const db = await readDb();
    const p = parseBriefPeriod(period ?? "", user.lastBriefAt);
    const { text, usedAi } = await writeBrief(db, briefData(db, p));
    await mutateDb((d) => {
      const me = d.users.find((u) => u.id === user.id);
      if (me) me.lastBriefAt = new Date().toISOString();
    });
    if (usedAi) await logAiExchange("brief", user.id, `brief ${period ?? ""}`.trim(), text);
    return Response.json({ text, usedAi, period: p.label });
  } catch (err) {
    return errorResponse(err);
  }
}
