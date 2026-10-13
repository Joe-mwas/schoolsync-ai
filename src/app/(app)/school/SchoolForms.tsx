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

export default function SchoolForms({
  classes,
  students,
  teachers,
  canCreateAdmin,
}: {
  classes: Option[];
  students: Option[];
  teachers: Option[];
  canCreateAdmin: boolean;
}) {
  const router = useRouter();
  const [person, setPerson] = useState({ name: "", email: "", role: "parent", phone: "", password: "", classId: "", childId: "", admissionNo: "" });
  const [cls, setCls] = useState({ name: "", teacherId: "" });
  const [msg, setMsg] = useState<{ person?: string; cls?: string }>({});

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
      setPerson({ name: "", email: "", role: person.role, phone: "", password: "", classId: "", childId: "", admissionNo: "" });
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
              <option value="secretary">Secretary</option>
              <option value="director">Director</option>
              {canCreateAdmin && <option value="admin">Administrator</option>}
            </select>
          </label>
          <label>
            Email{person.role === "parent" || person.role === "student" ? " (optional)" : ""}
            <input type="email" value={person.email} onChange={p("email")} required={person.role === "admin" || person.role === "director" || person.role === "secretary" || person.role === "teacher"} />
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
          {person.role === "student" && (
            <label>Admission number<input value={person.admissionNo} onChange={p("admissionNo")} placeholder="e.g. 1001 (M-Pesa account no.)" maxLength={20} /></label>
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

    </div>
  );
}
