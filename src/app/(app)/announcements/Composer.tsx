"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Role } from "@/lib/types";
import { summarize } from "./AnnouncementActions";

interface Option {
  id: string;
  name: string;
}

const AUDIENCES: { role: Role; label: string }[] = [
  { role: "teacher", label: "Teachers" },
  { role: "parent", label: "Parents" },
  { role: "student", label: "Students" },
];

export default function Composer({
  role,
  classes,
  posters,
  aiEnabled,
}: {
  role: Role;
  classes: Option[];
  posters: Option[];
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const isTeacher = role === "teacher";
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<Role[]>(isTeacher ? ["parent", "student"] : ["teacher", "parent", "student"]);
  const [classId, setClassId] = useState(isTeacher ? classes[0]?.id ?? "" : "");
  const [priority, setPriority] = useState<"normal" | "urgent">("normal");
  const [posterId, setPosterId] = useState("");
  const [sendWhatsApp, setSendWhatsApp] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<"draft" | "post" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  if (!open) {
    return (
      <div className="row">
        <button onClick={() => setOpen(true)}>+ New announcement</button>
        {result && <span className="small muted">{result}</span>}
      </div>
    );
  }

  async function draft() {
    setBusy("draft");
    setError(null);
    const res = await fetch("/api/announcements/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setTitle(data.title);
      setBody(data.body);
    } else {
      setError(data.error ?? "Drafting failed");
    }
    setBusy(null);
  }

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    setBusy("post");
    setError(null);
    const res = await fetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, audience, classId: classId || null, priority, posterId: posterId || null, sendWhatsApp }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(data.error ?? "Could not publish");
      return;
    }
    setResult(data.whatsapp ? `Published. ${summarize(data.whatsapp)}` : "Published.");
    setTitle("");
    setBody("");
    setNotes("");
    setOpen(false);
    router.refresh();
  }

  return (
    <form className="card stack" onSubmit={publish}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>New announcement</h2>
        <button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>

      {aiEnabled && (
        <div className="stack" style={{ background: "var(--surface-2)", padding: "0.75rem", borderRadius: 8 }}>
          <label>
            Draft with AI — jot down rough notes
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. school closes early friday 12pm for staff training, buses leave 12:15"
            />
          </label>
          <div>
            <button type="button" className="secondary" onClick={draft} disabled={!notes.trim() || busy !== null}>
              {busy === "draft" ? "Drafting…" : "✨ Write it for me"}
            </button>
          </div>
        </div>
      )}

      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
      </label>
      <label>
        Message
        <textarea value={body} onChange={(e) => setBody(e.target.value)} required rows={6} />
      </label>

      <div className="grid grid-3">
        <label>
          Class
          <select value={classId} onChange={(e) => setClassId(e.target.value)} required={isTeacher}>
            {!isTeacher && <option value="">School-wide</option>}
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select value={priority} onChange={(e) => setPriority(e.target.value as "normal" | "urgent")}>
            <option value="normal">Normal</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>
        <label>
          Attach poster
          <select value={posterId} onChange={(e) => setPosterId(e.target.value)}>
            <option value="">None</option>
            {posters.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="row">
        <span className="small" style={{ fontWeight: 600 }}>Audience:</span>
        {AUDIENCES.map((a) => (
          <label key={a.role} className="checkbox">
            <input
              type="checkbox"
              checked={audience.includes(a.role)}
              onChange={(e) => setAudience((cur) => (e.target.checked ? [...cur, a.role] : cur.filter((r) => r !== a.role)))}
            />
            {a.label}
          </label>
        ))}
      </div>

      <label className="checkbox">
        <input type="checkbox" checked={sendWhatsApp} onChange={(e) => setSendWhatsApp(e.target.checked)} />
        Also send to the audience on WhatsApp
      </label>

      {error && <div className="error">{error}</div>}
      <div>
        <button type="submit" disabled={busy !== null || audience.length === 0}>
          {busy === "post" ? "Publishing…" : "Publish"}
        </button>
      </div>
    </form>
  );
}
