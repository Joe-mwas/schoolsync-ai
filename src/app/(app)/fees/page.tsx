import { requireUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { currencyLabel, feeStatement } from "@/lib/fees";
import { LEADERS } from "@/lib/types";
import FeesManager from "./FeesManager";

export default async function FeesPage() {
  await requireUser(LEADERS);
  const db = await readDb();
  const classes = new Map(db.classes.map((c) => [c.id, c.name]));
  const learners = db.users
    .filter((u) => u.role === "student")
    .map((u) => {
      const st = feeStatement(db, u.id);
      return { id: u.id, name: u.name, classId: u.classIds[0] ?? null, className: classes.get(u.classIds[0] ?? "") ?? "—", charged: st.charged, paid: st.paid, balance: st.balance };
    })
    .sort((a, b) => a.className.localeCompare(b.className) || a.name.localeCompare(b.name));
  // Suggest the most recently used term.
  const defaultTerm = [...db.fees].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.term ?? "";
  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>Fees</h1>
          <p>Balances, statements and payments. Parents see their balance on WhatsApp (reply 2) and on their dashboard.</p>
        </div>
      </div>
      <FeesManager learners={learners} classes={db.classes.map((c) => ({ id: c.id, name: c.name }))} currency={currencyLabel()} defaultTerm={defaultTerm} />
    </div>
  );
}
