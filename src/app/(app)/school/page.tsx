import { requireUser, toPublic } from "@/lib/auth";
import { listSnapshots } from "@/lib/backup";
import { backupDirectory, readDb } from "@/lib/db";
import BackupsCard from "./BackupsCard";
import ImportCard from "./ImportCard";
import PeopleTable from "./PeopleTable";
import SchoolForms from "./SchoolForms";
import { PEOPLE_MANAGERS } from "@/lib/types";

export default async function SchoolPage() {
  const me = await requireUser(PEOPLE_MANAGERS);
  const db = await readDb();
  const snapshots = await listSnapshots(backupDirectory());
  const classes = new Map(db.classes.map((c) => [c.id, c.name]));
  const names = new Map(db.users.map((u) => [u.id, u.name]));

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>School Admin</h1>
          <p>Manage classes and people. Add classes and teachers first, then students, then parents. The calendar is under Events.</p>
        </div>
      </div>

      <ImportCard />

      <SchoolForms
        classes={db.classes.map((c) => ({ id: c.id, name: c.name }))}
        students={db.users.filter((u) => u.role === "student").map((u) => ({ id: u.id, name: u.name }))}
        teachers={db.users.filter((u) => u.role === "teacher").map((u) => ({ id: u.id, name: u.name }))}
        myRole={me.role}
      />

      <div className="card">
        <h2>Classes</h2>
        {db.classes.length === 0 ? (
          <p className="muted">No classes yet.</p>
        ) : (
          <ul className="list">
            {db.classes.map((c) => (
              <li key={c.id}>
                <strong>{c.name}</strong>
                <div className="small muted">
                  Teacher: {c.teacherId ? names.get(c.teacherId) : "Unassigned"} ·{" "}
                  {db.users.filter((u) => u.role === "student" && u.classIds.includes(c.id)).length} student(s)
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <PeopleTable
        people={db.users.map(toPublic)}
        classes={db.classes.map((c) => ({ id: c.id, name: c.name }))}
        students={db.users.filter((u) => u.role === "student").map((u) => ({ id: u.id, name: u.name }))}
        currentUserId={me.id}
        currentUserRole={me.role}
      />

      {me.role === "admin" && <BackupsCard initial={snapshots} />}
    </div>
  );
}
