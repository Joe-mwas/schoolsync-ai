"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ROLE_LABELS } from "@/lib/permissions";
import type { PublicUser } from "@/lib/types";

interface Option {
  id: string;
  name: string;
}

export default function PeopleTable({
  people,
  classes,
  students,
  currentUserId,
}: {
  people: PublicUser[];
  classes: Option[];
  students: Option[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const classNames = new Map(classes.map((c) => [c.id, c.name]));
  const studentNames = new Map(students.map((s) => [s.id, s.name]));

  const q = filter.trim().toLowerCase();
  const shown = q
    ? people.filter((p) => [p.name, p.email, p.phone ?? "", ROLE_LABELS[p.role]].some((v) => v.toLowerCase().includes(q)))
    : people;

  async function resetPassword(p: PublicUser) {
    const password = prompt(`New temporary password for ${p.name} (at least 8 characters). They'll be asked to change it when they sign in.`);
    if (!password) return;
    const res = await fetch(`/api/users/${p.id}/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    setMsg(res.ok ? `Password reset for ${p.name}. Share the temporary password with them privately.` : data.error ?? "Reset failed");
    router.refresh();
  }

  async function remove(p: PublicUser) {
    if (!confirm(`Remove ${p.name}? They will no longer be able to sign in.`)) return;
    const res = await fetch(`/api/users/${p.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setMsg(res.ok ? `Removed ${p.name}` : data.error ?? "Remove failed");
    router.refresh();
  }

  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>People ({people.length})</h2>
        <input placeholder="Search name, email, phone…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ minWidth: 220 }} />
      </div>
      {msg && <div className="small">{msg}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Class / children</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((p) =>
              editing === p.id ? (
                <tr key={p.id}>
                  <td colSpan={6}>
                    <EditPerson
                      person={p}
                      classes={classes}
                      students={students}
                      onDone={(text) => {
                        setEditing(null);
                        if (text) setMsg(text);
                        router.refresh();
                      }}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={p.id}>
                  <td>
                    {p.name}
                    {p.mustChangePassword && <div className="small muted">Temporary password</div>}
                  </td>
                  <td>{ROLE_LABELS[p.role]}</td>
                  <td className="small">{p.email || "—"}</td>
                  <td className="small">{p.phone ?? "—"}</td>
                  <td className="small">
                    {p.role === "parent"
                      ? p.childIds.map((id) => studentNames.get(id)).join(", ") || "—"
                      : p.classIds.map((id) => classNames.get(id)).join(", ") || "—"}
                  </td>
                  <td>
                    <div className="row" style={{ gap: "0.4rem", flexWrap: "nowrap" }}>
                      <button className="secondary small" onClick={() => setEditing(p.id)}>Edit</button>
                      {p.id !== currentUserId && (
                        <>
                          <button className="secondary small" onClick={() => resetPassword(p)}>Reset password</button>
                          <button className="danger small" onClick={() => remove(p)}>Remove</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EditPerson({
  person,
  classes,
  students,
  onDone,
}: {
  person: PublicUser;
  classes: Option[];
  students: Option[];
  onDone: (msg: string | null) => void;
}) {
  const [name, setName] = useState(person.name);
  const [email, setEmail] = useState(person.email);
  const [phone, setPhone] = useState(person.phone ?? "");
  const [classIds, setClassIds] = useState(person.classIds);
  const [childIds, setChildIds] = useState(person.childIds);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = { name, email, phone };
    if (person.role === "teacher" || person.role === "student") body.classIds = classIds;
    if (person.role === "parent") body.childIds = childIds;
    const res = await fetch(`/api/users/${person.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) onDone(`Saved ${name}`);
    else setError(data.error ?? "Save failed");
  }

  const toggle = (list: string[], id: string, on: boolean) => (on ? [...list, id] : list.filter((x) => x !== id));

  return (
    <form className="stack" onSubmit={save} style={{ background: "var(--surface-2)", padding: "0.75rem", borderRadius: 8 }}>
      <div className="grid grid-3">
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label>
          Email{person.role === "parent" || person.role === "student" ? " (optional)" : ""}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required={person.role === "director" || person.role === "teacher"} />
        </label>
        <label>WhatsApp phone<input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+2547…" /></label>
      </div>
      {person.role === "student" && (
        <label style={{ maxWidth: 320 }}>
          Class
          <select value={classIds[0] ?? ""} onChange={(e) => setClassIds(e.target.value ? [e.target.value] : [])}>
            <option value="">—</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
      {(person.role === "teacher" || person.role === "parent") && (
        <div>
          <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>{person.role === "teacher" ? "Classes taught" : "Children"}</div>
          <div className="row">
            {(person.role === "teacher" ? classes : students).map((o) => {
              const list = person.role === "teacher" ? classIds : childIds;
              const set = person.role === "teacher" ? setClassIds : setChildIds;
              return (
                <label key={o.id} className="checkbox">
                  <input type="checkbox" checked={list.includes(o.id)} onChange={(e) => set(toggle(list, o.id, e.target.checked))} />
                  {o.name}
                </label>
              );
            })}
          </div>
        </div>
      )}
      {error && <div className="error">{error}</div>}
      <div className="row">
        <button type="submit">Save</button>
        <button type="button" className="secondary" onClick={() => onDone(null)}>Cancel</button>
      </div>
    </form>
  );
}
