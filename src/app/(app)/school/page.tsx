import { formatDate } from "@/components/AnnouncementCard";
import { requireUser, toPublic } from "@/lib/auth";
import { readDb } from "@/lib/db";
import ImportCard from "./ImportCard";
import PeopleTable from "./PeopleTable";
import SchoolForms, { DeleteEventButton } from "./SchoolForms";

export default async function SchoolPage() {
  const me = await requireUser(["director"]);
  const db = await readDb();
  const classes = new Map(db.classes.map((c) => [c.id, c.name]));
  const names = new Map(db.users.map((u) => [u.id, u.name]));
  const events = [...db.events].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>School Admin</h1>
          <p>Manage classes, people and the school calendar. Add classes and teachers first, then students, then parents.</p>
        </div>
      </div>

      <ImportCard />

      <SchoolForms
        classes={db.classes.map((c) => ({ id: c.id, name: c.name }))}
        students={db.users.filter((u) => u.role === "student").map((u) => ({ id: u.id, name: u.name }))}
        teachers={db.users.filter((u) => u.role === "teacher").map((u) => ({ id: u.id, name: u.name }))}
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

      <div className="card">
        <h2>Events</h2>
        <ul className="list">
          {events.map((e) => (
            <li key={e.id} className="row" style={{ justifyContent: "space-between" }}>
              <span>
                <strong>{e.title}</strong> <span className="muted small">· {formatDate(e.date)}</span>
                <div className="small muted">{e.description}</div>
              </span>
              <DeleteEventButton id={e.id} />
            </li>
          ))}
        </ul>
      </div>

      <PeopleTable
        people={db.users.map(toPublic)}
        classes={db.classes.map((c) => ({ id: c.id, name: c.name }))}
        students={db.users.filter((u) => u.role === "student").map((u) => ({ id: u.id, name: u.name }))}
        currentUserId={me.id}
      />
    </div>
  );
}
