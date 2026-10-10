"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Option {
  id: string;
  name: string;
}

async function post(url: string, body: unknown): Promise<string | null> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.ok ? null : (await res.json().catch(() => ({}))).error ?? "Request failed";
}

export default function SchoolForms({ classes, students, teachers }: { classes: Option[]; students: Option[]; teachers: Option[] }) {
  const router = useRouter();
  const [person, setPerson] = useState({ name: "", email: "", role: "parent", phone: "", password: "", classId: "", childId: "" });
  const [event, setEvent] = useState({ title: "", date: "", description: "" });
  const [cls, setCls] = useState({ name: "", teacherId: "" });
  const [msg, setMsg] = useState<{ person?: string; event?: string; cls?: string }>({});

  async function addClass(e: React.FormEvent) {
    e.preventDefault();
    const err = await post("/api/classes", cls);
    setMsg({ cls: err ?? `Added ${cls.name}` });
    if (!err) {
      setCls({ name: "", teacherId: "" });
      router.refresh();
    }
  }

  async function addPerson(e: React.FormEvent) {
    e.preventDefault();
    const err = await post("/api/users", person);
    setMsg({ person: err ?? `Added ${person.name}. Share the temporary password privately; they will choose their own when they first sign in.` });
    if (!err) {
      setPerson({ name: "", email: "", role: person.role, phone: "", password: "", classId: "", childId: "" });
      router.refresh();
    }
  }

  async function addEvent(e: React.FormEvent) {
    e.preventDefault();
    const err = await post("/api/events", event);
    setMsg({ event: err ?? `Added ${event.title}` });
    if (!err) {
      setEvent({ title: "", date: "", description: "" });
      router.refresh();
    }
  }

  const p = (k: keyof typeof person) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setPerson({ ...person, [k]: e.target.value });

  return (
    <div className="grid grid-2">
      <form className="card stack" onSubmit={addPerson}>
        <h2>Add a person</h2>
        <div className="grid grid-2">
          <label>Name<input value={person.name} onChange={p("name")} required /></label>
          <label>
            Role
            <select value={person.role} onChange={p("role")}>
              <option value="parent">Parent</option>
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="director">Director</option>
            </select>
          </label>
          <label>
            Email{person.role === "parent" || person.role === "student" ? " (optional)" : ""}
            <input type="email" value={person.email} onChange={p("email")} required={person.role === "director" || person.role === "teacher"} />
          </label>
          <label>WhatsApp phone<input value={person.phone} onChange={p("phone")} placeholder="+2547…" /></label>
          <label>Temporary password<input type="password" value={person.password} onChange={p("password")} required minLength={8} /></label>
          {(person.role === "teacher" || person.role === "student") && (
            <label>
              Class
              <select value={person.classId} onChange={p("classId")}>
                <option value="">—</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          {person.role === "parent" && (
            <label>
              Child
              <select value={person.childId} onChange={p("childId")}>
                <option value="">—</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}
        </div>
        {msg.person && <div className="small">{msg.person}</div>}
        <div><button type="submit">Add person</button></div>
      </form>

      <form className="card stack" onSubmit={addClass}>
        <h2>Add a class</h2>
        <label>Class name<input value={cls.name} onChange={(e) => setCls({ ...cls, name: e.target.value })} placeholder="e.g. Grade 6 North" required /></label>
        <label>
          Class teacher
          <select value={cls.teacherId} onChange={(e) => setCls({ ...cls, teacherId: e.target.value })}>
            <option value="">Assign later</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        {msg.cls && <div className="small">{msg.cls}</div>}
        <div><button type="submit">Add class</button></div>
      </form>

      <form className="card stack" onSubmit={addEvent}>
        <h2>Add an event</h2>
        <label>Title<input value={event.title} onChange={(e) => setEvent({ ...event, title: e.target.value })} required /></label>
        <label>Date<input type="date" value={event.date} onChange={(e) => setEvent({ ...event, date: e.target.value })} required /></label>
        <label>Description<textarea value={event.description} onChange={(e) => setEvent({ ...event, description: e.target.value })} /></label>
        {msg.event && <div className="small">{msg.event}</div>}
        <div><button type="submit">Add event</button></div>
      </form>
    </div>
  );
}

export function DeleteEventButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <button
      className="danger small"
      onClick={async () => {
        if (!confirm("Delete this event?")) return;
        await fetch(`/api/events/${id}`, { method: "DELETE" });
        router.refresh();
      }}
    >
      Delete
    </button>
  );
}
