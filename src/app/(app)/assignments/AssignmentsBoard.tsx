"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Assignment, Role } from "@/lib/types";

interface ClassOption {
  id: string;
  name: string;
  learners: number;
}

const EMPTY = { kind: "assignment" as Assignment["kind"], title: "", subject: "", details: "", classIds: [] as string[], dueDate: "", link: "" };

function dueLabel(due: string, today: string): { text: string; urgent: boolean } {
  const days = Math.round((Date.parse(due) - Date.parse(today)) / 86_400_000);
  if (days < 0) return { text: `Overdue (was due ${due})`, urgent: true };
  if (days === 0) return { text: "Due today", urgent: true };
  if (days === 1) return { text: "Due tomorrow", urgent: true };
  return { text: `Due ${new Date(due).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`, urgent: false };
}

export default function AssignmentsBoard({ items, classes, subjects, names, me, today }: { items: Assignment[]; classes: ClassOption[]; subjects: string[]; names: Record<string, string>; me: { id: string; role: Role }; today: string }) {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const isStudent = me.role === "student";
  const classNames = new Map(classes.map((c) => [c.id, c]));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/assignments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: data.error ?? "Couldn't save it" });
    setMsg({ ok: true, text: `Set "${data.assignment.title}". Learners in ${form.classIds.map((id) => classNames.get(id)?.name).join(", ")} can see it now.` });
    setForm({ ...EMPTY, kind: form.kind, subject: form.subject, classIds: form.classIds });
    router.refresh();
  }

  async function setDone(a: Assignment, done: boolean) {
    const res = await fetch(`/api/assignments/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done }) });
    if (res.ok) router.refresh();
  }

  async function remove(a: Assignment) {
    if (!confirm(`Remove "${a.title}"? Learners won't see it any more.`)) return;
    const res = await fetch(`/api/assignments/${a.id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  const toggleClass = (id: string) => setForm((f) => ({ ...f, classIds: f.classIds.includes(id) ? f.classIds.filter((x) => x !== id) : [...f.classIds, id] }));
  const canRemove = (a: Assignment) => me.role === "admin" || me.role === "headteacher" || a.createdBy === me.id;

  const card = (a: Assignment) => {
    const done = a.doneBy.includes(me.id);
    const due = a.dueDate ? dueLabel(a.dueDate, today) : null;
    const learners = a.classIds.reduce((n, id) => n + (classNames.get(id)?.learners ?? 0), 0);
    return (
      <li key={a.id} className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "nowrap", opacity: isStudent && done ? 0.65 : 1 }}>
        <div className="stack" style={{ gap: 4 }}>
          <div>
            {a.kind === "assignment" && <><span className="badge">{a.subject}</span> </>}<strong>{a.title}</strong>
          </div>
          {due && !(isStudent && done) && <div className="small"><span className={`badge ${due.urgent ? "urgent" : ""}`}>{due.text}</span></div>}
          {a.details && <div className="small" style={{ whiteSpace: "pre-wrap" }}>{a.details}</div>}
          {a.link && <a className="small" href={a.link} target="_blank" rel="noopener noreferrer">Open the link →</a>}
          <div className="small muted">
            {isStudent ? `From ${names[a.createdBy] ?? "your teacher"}` : `${a.classIds.map((id) => classNames.get(id)?.name ?? "removed class").join(", ")} · set by ${names[a.createdBy] ?? "a teacher"}`}
            {!isStudent && a.kind === "assignment" && ` · ${a.doneBy.length} of ${learners} learner${learners === 1 ? "" : "s"} done`}
          </div>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
          {isStudent && a.kind === "assignment" &&
            (done ? <button className="secondary small" onClick={() => setDone(a, false)}>Not done</button> : <button className="small" onClick={() => setDone(a, true)}>Mark done</button>)}
          {!isStudent && canRemove(a) && <button className="danger small" onClick={() => remove(a)}>Remove</button>}
        </div>
      </li>
    );
  };

  const assignments = items.filter((a) => a.kind === "assignment");
  const revision = items.filter((a) => a.kind === "revision");
  const todo = isStudent ? assignments.filter((a) => !a.doneBy.includes(me.id)) : assignments.filter((a) => (a.dueDate ?? "") >= today);
  const finished = isStudent ? assignments.filter((a) => a.doneBy.includes(me.id)) : assignments.filter((a) => (a.dueDate ?? "") < today);
  const bySubject = [...new Set(revision.map((a) => a.subject))].sort();

  return (
    <div className="stack">
      {!isStudent && (
        <form className="card stack" onSubmit={save}>
          <h2>Set work</h2>
          <div className="row">
            <label className="checkbox"><input type="radio" name="kind" checked={form.kind === "assignment"} onChange={() => setForm({ ...form, kind: "assignment" })} /> Assignment (has a due date)</label>
            <label className="checkbox"><input type="radio" name="kind" checked={form.kind === "revision"} onChange={() => setForm({ ...form, kind: "revision" })} /> Revision (notes or practice)</label>
          </div>
          <div className="grid grid-3">
            <label>Title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={form.kind === "revision" ? "e.g. End of term revision" : "e.g. Fractions worksheet"} required maxLength={120} /></label>
            <label>
              Subject
              <input list="subjects" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Mathematics" required maxLength={60} />
              <datalist id="subjects">{subjects.map((s) => <option key={s} value={s} />)}</datalist>
            </label>
            {form.kind === "assignment" && <label>Due date<input type="date" value={form.dueDate} min={today} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} required /></label>}
          </div>
          <label>
            {form.kind === "revision" ? "What to revise" : "Instructions"}
            <textarea value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} rows={3} maxLength={3000} placeholder={form.kind === "revision" ? "e.g. Topics to revise and practice questions (book pages)" : "e.g. Exercise 4B, questions 1–10. Show your working."} />
          </label>
          <label>Link (optional)<input type="url" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://… (a worksheet, video or past paper)" maxLength={500} /></label>
          <div>
            <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>Classes</div>
            {classes.length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>You don&apos;t have a class yet. Ask the headteacher to assign you one.</p>
            ) : (
              <div className="row">
                {classes.map((c) => (
                  <label key={c.id} className="checkbox">
                    <input type="checkbox" checked={form.classIds.includes(c.id)} onChange={() => toggleClass(c.id)} />
                    {c.name} <span className="muted">({c.learners})</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          {msg && <div className={msg.ok ? "small" : "error"}>{msg.ok ? "✅ " : ""}{msg.text}</div>}
          <div><button type="submit" disabled={busy || form.classIds.length === 0}>{busy ? "Saving…" : form.kind === "revision" ? "Share revision" : "Set assignment"}</button></div>
        </form>
      )}

      <div className="card stack">
        <h2>{isStudent ? "To do" : "Assignments"} ({todo.length})</h2>
        {todo.length === 0 ? <p className="small muted" style={{ margin: 0 }}>{isStudent ? "Nothing to do. Well done! 🎉" : "No assignments due."}</p> : <ul className="list">{todo.map(card)}</ul>}
        {finished.length > 0 && (
          <div>
            <button className="link small" onClick={() => setShowDone(!showDone)}>{showDone ? "Hide" : "Show"} {isStudent ? "done" : "past"} ({finished.length})</button>
            {showDone && <ul className="list">{finished.map(card)}</ul>}
          </div>
        )}
      </div>

      <div className="card stack">
        <h2>Revision ({revision.length})</h2>
        {revision.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>{isStudent ? "No revision work yet." : "Nothing shared for revision yet."}</p>
        ) : (
          bySubject.map((s) => (
            <div key={s}>
              <h3 style={{ margin: "4px 0" }}>{s}</h3>
              <ul className="list">{revision.filter((a) => a.subject === s).map(card)}</ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
