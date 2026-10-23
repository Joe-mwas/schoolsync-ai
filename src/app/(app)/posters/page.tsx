import { requireUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import Designer from "./Designer";
import { isSchoolWide, POSTER_MAKERS } from "@/lib/types";

export default async function PostersPage() {
  const user = await requireUser(POSTER_MAKERS);
  const db = await readDb();
  const posters = isSchoolWide(user.role) ? db.posters : db.posters.filter((p) => p.authorId === user.id);
  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>Poster Designer</h1>
          <p>Design event posters, then share them on the noticeboard: everyone you choose sees them on their dashboard, and their phones are notified.</p>
        </div>
      </div>
      <Designer
        initialPosters={posters}
        classes={db.classes.filter((c) => isSchoolWide(user.role) || user.classIds.includes(c.id)).map((c) => ({ id: c.id, name: c.name }))}
        classRequired={!isSchoolWide(user.role)}
        sharedIds={[...new Set(db.announcements.map((a) => a.posterId).filter((id): id is string => Boolean(id)))]}
      />
    </div>
  );
}
