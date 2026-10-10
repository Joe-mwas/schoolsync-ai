import { requireUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { isLeader, STAFF } from "@/lib/types";
import ResultsEditor from "./ResultsEditor";

export default async function ResultsPage() {
  const user = await requireUser(STAFF);
  const db = await readDb();
  const classes = db.classes
    .filter((c) => isLeader(user.role) || user.classIds.includes(c.id))
    .map((c) => ({ id: c.id, name: c.name }));
  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>Results</h1>
          <p>Record CBC levels per learning area. Parents see them on WhatsApp (reply 1) and on their dashboard.</p>
        </div>
      </div>
      <ResultsEditor classes={classes} />
    </div>
  );
}
