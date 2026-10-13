import { errorResponse, requireApiUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { feeStatement } from "@/lib/fees";
import { OFFICE } from "@/lib/types";

/** GET: every learner's fee totals (leaders only). */
export async function GET() {
  try {
    await requireApiUser(OFFICE);
    const db = await readDb();
    const classes = new Map(db.classes.map((c) => [c.id, c.name]));
    const learners = db.users
      .filter((u) => u.role === "student")
      .map((u) => {
        const st = feeStatement(db, u.id);
        return { id: u.id, name: u.name, classId: u.classIds[0] ?? null, className: classes.get(u.classIds[0] ?? "") ?? "—", charged: st.charged, paid: st.paid, balance: st.balance };
      })
      .sort((a, b) => a.className.localeCompare(b.className) || a.name.localeCompare(b.name));
    return Response.json({ learners });
  } catch (err) {
    return errorResponse(err);
  }
}
