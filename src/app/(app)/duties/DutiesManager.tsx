"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Duty } from "@/lib/types";

interface Teacher {
  id: string;
  name: string;
  classes: string;
  hasWhatsApp: boolean;
}

function when(d: Duty): string {
  if (d.startDate && d.endDate) return d.startDate === d.endDate ? d.startDate : `${d.startDate} → ${d.endDate}`;
  if (d.startDate) return `from ${d.startDate}`;
  if (d.endDate) return `by ${d.endDate}`;
  return "";
}

export default function DutiesManager({ duties, teachers, names, canAssign, myId }: { duties: Duty[]; teachers: Teacher[]; names: Record<string, string>; canAssign: boolean; myId: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ title: "", details: "", startDate: "", endDate: "", teacherIds: [] as string[] });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDone, setShowDone] = useState(false);

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/duties", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: data.error ?? "Couldn't assign the duty" });
    const missing: string[] = data.withoutWhatsApp ?? [];
    setMsg({ ok: true, text: `Assigned "${data.duty.title}". ${data.notified ? `${data.notified} teacher${data.notified === 1 ? "" : "s"} told on WhatsApp.` : ""}${missing.length ? ` No WhatsApp number for ${missing.join(", ")}: tell them in person.` : ""}` });
    setForm({ title: "", details: "", startDate: "", endDate: "", teacherIds: [] });
    router.refresh();
  }

  async function setStatus(d: Duty, status: Duty["status"]) {
    const res = await fetch(`/api/duties/${d.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (res.ok) router.refresh();
  }

  async function remove(d: Duty) {
    if (!confirm(`Remove the duty "${d.title}"?`)) return;
    const res = await fetch(`/api/duties/${d.id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  const open = duties.filter((d) => d.status === "open");
  const done = duties.filter((d) => d.status === "done");
  const toggle = (id: string) => setForm((f) => ({ ...f, teacherIds: f.teacherIds.includes(id) ? f.teacherIds.filter((x) => x !== id) : [...f.teacherIds, id] }));

  const row = (d: Duty) => (
    <li key={d.id} className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "nowrap", opacity: d.status === "done" ? 0.65 : 1 }}>
      <div>
        <strong>{d.title}</strong>
        {when(d) && <span className="small muted"> · {when(d)}</span>}
        {canAssign && <div className="small">For: {d.teacherIds.map((id) => names[id] ?? "removed teacher").join(", ")}</div>}
        {d.details && <div className="small muted" style={{ whiteSpace: "pre-wrap" }}>{d.details}</div>}
        <div className="small muted">
          From {names[d.createdBy] ?? "the school"}
          {d.status === "done" && d.doneAt ? ` · done ${d.doneAt.slice(0, 10)}${d.doneBy && d.doneBy !== myId ? ` by ${names[d.doneBy] ?? ""}` : ""}` : ""}
        </div>
      </div>
      <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
        {d.status === "open" ? (
          <button className="small" onClick={() => setStatus(d, "done")}>Mark done</button>
        ) : (
          <button className="secondary small" onClick={() => setStatus(d, "open")}>Reopen</button>
        )}
        {canAssign && <button className="danger small" onClick={() => remove(d)}>Remove</button>}
      </div>
    </li>
  );

  return (
    <div className="stack">
      {canAssign && (
        <form className="card stack" onSubmit={assign}>
          <h2>Assign a duty</h2>
          <div className="grid grid-3">
            <label style={{ gridColumn: "span 1" }}>Duty<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Duty teacher this week" required maxLength={120} /></label>
            <label>From (optional)<input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
            <label>To (optional)<input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>
          </div>
          <label>Details (optional)<textarea value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} rows={2} maxLength={1000} placeholder="e.g. Morning gate 7:00–7:45, lunch supervision, evening prep" /></label>
          <div>
            <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>Teachers</div>
            {teachers.length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>No teachers yet. Add them in School Admin.</p>
            ) : (
              <div className="row">
                {teachers.map((t) => (
                  <label key={t.id} className="checkbox" title={t.hasWhatsApp ? "" : "No WhatsApp number"}>
                    <input type="checkbox" checked={form.teacherIds.includes(t.id)} onChange={() => toggle(t.id)} />
                    {t.name}{t.classes ? <span className="muted"> ({t.classes})</span> : null}{!t.hasWhatsApp && <span className="muted"> ✱</span>}
                  </label>
                ))}
              </div>
            )}
            {teachers.some((t) => !t.hasWhatsApp) && <div className="small muted">✱ no WhatsApp number, so they'll only see it here</div>}
          </div>
          {msg && <div className={msg.ok ? "small" : "error"}>{msg.ok ? "✅ " : ""}{msg.text}</div>}
          <div><button type="submit" disabled={busy || form.teacherIds.length === 0}>{busy ? "Assigning…" : "Assign duty"}</button></div>
        </form>
      )}

      <div className="card stack">
        <h2>{canAssign ? "Open duties" : "My duties"} ({open.length})</h2>
        {open.length === 0 ? <p className="small muted" style={{ margin: 0 }}>Nothing open.</p> : <ul className="list">{open.map(row)}</ul>}
        {done.length > 0 && (
          <div>
            <button className="link small" onClick={() => setShowDone(!showDone)}>{showDone ? "Hide" : "Show"} finished duties ({done.length})</button>
            {showDone && <ul className="list">{done.map(row)}</ul>}
          </div>
        )}
      </div>
    </div>
  );
}
