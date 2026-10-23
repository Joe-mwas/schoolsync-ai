import { requireUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { isSchoolWide, STAFF } from "@/lib/types";
import FamilyResults from "./FamilyResults";
import ResultsEditor from "./ResultsEditor";

export default async function ResultsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser([...STAFF, "parent"]);
  const db = await readDb();
  if (user.role === "parent") {
    const { child, type } = await searchParams;
    return (
      <div className="stack">
        <div className="page-header">
          <div>
            <h1>Results</h1>
            <p>Every quiz, CAT and exam, as soon as teachers enter them.</p>
          </div>
        </div>
        <FamilyResults db={db} parent={user} childId={typeof child === "string" ? child : ""} type={typeof type === "string" ? type : ""} />
      </div>
    );
  }
  const classes = db.classes
    .filter((c) => isSchoolWide(user.role) || user.classIds.includes(c.id))
    .map((c) => ({ id: c.id, name: c.name }));
  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>Results</h1>
          <p>{user.role === "secretary" ? "CBC levels for every class (view only)." : "Record CBC levels per learning area."} Parents see every assessment under Results in the portal, and the latest on WhatsApp (reply 1).</p>
        </div>
      </div>
      <ResultsEditor classes={classes} readOnly={user.role === "secretary"} />
    </div>
  );
}
