import { requireUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import Designer from "./Designer";

export default async function PostersPage() {
  const user = await requireUser(["director", "teacher"]);
  const db = await readDb();
  const posters = user.role === "director" ? db.posters : db.posters.filter((p) => p.authorId === user.id);
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
