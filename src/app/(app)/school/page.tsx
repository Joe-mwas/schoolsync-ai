import { formatDate } from "@/components/AnnouncementCard";
import { requireUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/permissions";
import SchoolForms, { DeleteEventButton } from "./SchoolForms";

export default async function SchoolPage() {
  await requireUser(["director"]);
  const db = await readDb();
  const classes = new Map(db.classes.map((c) => [c.id, c.name]));
  const names = new Map(db.users.map((u) => [u.id, u.name]));
  const events = [...db.events].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>School Admin</h1>
          <p>Manage people and the school calendar.</p>
        </div>
      </div>

      <SchoolForms
        classes={db.classes.map((c) => ({ id: c.id, name: c.name }))}
        students={db.users.filter((u) => u.role === "student").map((u) => ({ id: u.id, name: u.name }))}
      />

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

      <div className="card">
        <h2>People</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Class / children</th>
              </tr>
            </thead>
            <tbody>
              {db.users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{ROLE_LABELS[u.role]}</td>
                  <td className="small">{u.email}</td>
                  <td className="small">{u.phone ?? "—"}</td>
                  <td className="small">
                    {u.role === "parent"
                      ? u.childIds.map((id) => names.get(id)).join(", ") || "—"
                      : u.classIds.map((id) => classes.get(id)).join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
