"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface EventItem {
  id: string;
  title: string;
  date: string;
  description: string;
}

/** The school calendar: shown to everyone, on WhatsApp (reply 3) and used by the AI. */
export default function EventsManager({ events, today }: { events: EventItem[]; today: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ title: "", date: "", description: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg({ ok: false, text: data.error ?? "Couldn't add the event" });
    setMsg({ ok: true, text: `Added ${form.title}` });
    setForm({ title: "", date: "", description: "" });
    router.refresh();
  }

  async function remove(ev: EventItem) {
    if (!confirm(`Delete "${ev.title}"?`)) return;
    await fetch(`/api/events/${ev.id}`, { method: "DELETE" });
    router.refresh();
  }

  const upcoming = events.filter((e) => e.date >= today);
  const past = events.filter((e) => e.date < today).reverse();
  const list = (items: EventItem[]) => (
    <ul className="list">
      {items.map((ev) => (
        <li key={ev.id} className="row" style={{ justifyContent: "space-between" }}>
          <span>
            <strong>{ev.title}</strong> <span className="muted small">· {ev.date}</span>
            {ev.description && <div className="small muted">{ev.description}</div>}
          </span>
          <button className="danger small" onClick={() => remove(ev)}>Delete</button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      <form className="card stack" onSubmit={add}>
        <h2>Add an event</h2>
        <label>Title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. PTA meeting" required /></label>
        <label>Date<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></label>
        <label>Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Time, place, what to bring…" /></label>
        {msg && <div className={msg.ok ? "small" : "error"}>{msg.ok ? "✅ " : ""}{msg.text}</div>}
        <div><button type="submit">Add event</button></div>
      </form>
      <div className="stack">
        <div className="card">
          <h2>Upcoming</h2>
          {upcoming.length ? list(upcoming) : <p className="muted">No upcoming events.</p>}
        </div>
        {past.length > 0 && (
          <details className="card">
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Past events ({past.length})</summary>
            {list(past)}
          </details>
        )}
      </div>
    </div>
  );
}
