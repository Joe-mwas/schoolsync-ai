import { requireUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import Designer from "./Designer";
import { isOffice, STAFF } from "@/lib/types";

export default async function PostersPage() {
  const user = await requireUser(STAFF);
  const db = await readDb();
  const posters = isOffice(user.role) ? db.posters : db.posters.filter((p) => p.authorId === user.id);
  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>Poster Designer</h1>
          <p>Design event posters, download them as PNG, and attach them to announcements.</p>
        </div>
      </div>
      <Designer initialPosters={posters} />
    </div>
  );
}
