"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FACT_TOPICS, type FactTopic, type SchoolFact } from "@/lib/types";

/** What parents most often ask, offered as a starting point for empty topics. */
const STARTERS: { topic: FactTopic; title: string; hint: string }[] = [
  { topic: "Fees and payments", title: "How to pay school fees", hint: "e.g. M-Pesa Paybill number, account format, bank details, deadlines" },
  { topic: "Fees and payments", title: "Fee structure", hint: "e.g. fees per term for each grade, what's included, extra charges" },
  { topic: "Uniform", title: "School uniform", hint: "e.g. what to wear on normal days and sports days, where to buy it" },
  { topic: "Term dates", title: "Term dates", hint: "e.g. opening and closing dates, half-term, exam weeks" },
  { topic: "School hours", title: "School day times", hint: "e.g. gate opening, start and end of lessons, clubs" },
  { topic: "Contacts", title: "Who to contact", hint: "e.g. office phone, bursar, class teachers, office hours" },
  { topic: "Transport", title: "School transport", hint: "e.g. routes, pick-up times, cost per term" },
  { topic: "Meals", title: "Lunch and meals", hint: "e.g. what's served, cost, packed lunch rules" },
];

/** Phone photos are large: shrink to at most 1600px as a JPEG before upload. */
async function shrink(file: File): Promise<Blob> {
  const img = await createImageBitmap(file).catch(() => null);
  if (!img) return file;
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.85));
}

/** A fact's picture: sent on WhatsApp when someone asks to see it. */
function FactPicture({ fact, onError }: { fact: SchoolFact; onError: (text: string) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    const form = new FormData();
    form.append("file", await shrink(file), "picture.jpg");
    const res = await fetch(`/api/facts/${fact.id}/image`, { method: "POST", body: form });
    setBusy(false);
    if (!res.ok) return onError((await res.json().catch(() => ({}))).error ?? "Couldn't upload the picture");
    router.refresh();
  }

  async function removePicture() {
    if (!confirm(`Remove the picture from "${fact.title}"?`)) return;
    await fetch(`/api/facts/${fact.id}/image`, { method: "DELETE" });
    router.refresh();
  }

  const picker = (label: string) => (
    <label className="button secondary small" style={{ margin: 0 }}>
      {busy ? "Uploading…" : label}
      <input type="file" accept="image/jpeg,image/png,image/*" onChange={upload} disabled={busy} hidden />
    </label>
  );

  if (!fact.image) return <div style={{ marginTop: 6 }}>{picker("🖼 Add a picture")}</div>;
  return (
    <div className="row" style={{ marginTop: 8, alignItems: "flex-end" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/facts/${fact.id}/image?v=${fact.image.file}`} alt={fact.title} style={{ maxHeight: 140, maxWidth: 220, borderRadius: 8, border: "1px solid var(--border)" }} />
      <div className="stack" style={{ gap: 4 }}>
        <span className="small muted">Sent on WhatsApp when someone asks to see it.</span>
        <div className="row" style={{ gap: 6 }}>
          {picker("Replace")}
          <button type="button" className="secondary small" onClick={removePicture}>Remove</button>
        </div>
      </div>
    </div>
  );
}

type Draft = { id?: string; topic: FactTopic; title: string; details: string; visibleTo: "everyone" | "staff"; fromAiLogId?: string | null };

export default function FactsEditor({ facts, initialDraft, correcting }: { facts: SchoolFact[]; initialDraft: Draft | null; correcting: { question: string; answer: string } | null }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(initialDraft);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    const res = await fetch(draft.id ? `/api/facts/${draft.id}` : "/api/facts", {
      method: draft.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? "Couldn't save" });
      return;
    }
    setMsg({ ok: true, text: `Saved "${data.fact.title}". The AI uses it from the next question.` });
    setDraft(null);
    if (correcting) router.replace("/facts");
    router.refresh();
  }

  async function remove(f: SchoolFact) {
    if (!confirm(`Delete the fact "${f.title}"? The AI will stop using it.`)) return;
    await fetch(`/api/facts/${f.id}`, { method: "DELETE" });
    router.refresh();
  }

  const missing = STARTERS.filter((s) => !facts.some((f) => f.topic === s.topic && f.title.toLowerCase() === s.title.toLowerCase()));

  return (
    <div className="stack">
      {draft ? (
        <form className="card stack" onSubmit={save}>
          <h2>{draft.id ? "Edit fact" : correcting ? "Correct the AI with a school fact" : "New school fact"}</h2>
          {correcting && (
            <div className="stack small" style={{ background: "var(--surface-2)", padding: "0.75rem", borderRadius: 8 }}>
              <div><strong>Question:</strong> {correcting.question}</div>
              <div><strong>The AI answered:</strong> {correcting.answer}</div>
              <div className="muted">Write the correct information below. The AI will use it for this question and every similar one.</div>
            </div>
          )}
          <div className="grid grid-2">
            <label>
              Topic
              <select value={draft.topic} onChange={(e) => setDraft({ ...draft, topic: e.target.value as FactTopic })}>
                {FACT_TOPICS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label>
              Who may be told this
              <select value={draft.visibleTo} onChange={(e) => setDraft({ ...draft, visibleTo: e.target.value as "everyone" | "staff" })}>
                <option value="everyone">Everyone (parents, learners, staff)</option>
                <option value="staff">Staff only</option>
              </select>
            </label>
          </div>
          <label>
            Title
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. How to pay school fees" required maxLength={120} />
          </label>
          <label>
            The fact
            <textarea
              value={draft.details}
              onChange={(e) => setDraft({ ...draft, details: e.target.value })}
              rows={5}
              required
              maxLength={2000}
              placeholder="Write it as you'd tell a parent, with the exact numbers, dates and names."
            />
          </label>
          {msg && !msg.ok && <div className="error">{msg.text}</div>}
          <div className="row">
            <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save fact"}</button>
            <button type="button" className="secondary" onClick={() => { setDraft(null); if (correcting) router.replace("/facts"); }}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="row">
          <button onClick={() => { setMsg(null); setDraft({ topic: "Other", title: "", details: "", visibleTo: "everyone" }); }}>+ Add a fact</button>
          {msg && <span className={msg.ok ? "small" : "error"}>{msg.ok ? "✅ " : ""}{msg.text}</span>}
        </div>
      )}

      {!draft && missing.length > 0 && (
        <div className="card stack">
          <h2>Start with what parents ask most</h2>
          <div className="small muted">Click one to fill it in. Each one you add stops the AI guessing about that topic.</div>
          <div className="row">
            {missing.map((s) => (
              <button key={s.title} className="secondary small" onClick={() => { setMsg(null); setDraft({ topic: s.topic, title: s.title, details: "", visibleTo: "everyone" }); }} title={s.hint}>
                + {s.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {FACT_TOPICS.map((topic) => {
        const group = facts.filter((f) => f.topic === topic);
        if (group.length === 0) return null;
        return (
          <div key={topic} className="card stack">
            <h2>{topic}</h2>
            <ul className="list">
              {group.map((f) => (
                <li key={f.id} className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "nowrap" }}>
                  <div>
                    <strong>{f.title}</strong>
                    {f.visibleTo === "staff" && <span className="badge" style={{ marginLeft: 8 }}>Staff only</span>}
                    {f.fromAiLogId && <span className="badge ok" style={{ marginLeft: 8 }}>From AI Review</span>}
                    <div className="small" style={{ whiteSpace: "pre-wrap" }}>{f.details}</div>
                    <FactPicture fact={f} onError={(text) => setMsg({ ok: false, text })} />
                  </div>
                  <div className="row" style={{ gap: "0.4rem", flexWrap: "nowrap" }}>
                    <button className="secondary small" onClick={() => { setMsg(null); setDraft({ id: f.id, topic: f.topic, title: f.title, details: f.details, visibleTo: f.visibleTo }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button>
                    <button className="danger small" onClick={() => remove(f)}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
