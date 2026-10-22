"use client";

import { useEffect, useRef, useState } from "react";
import type { AdminAction, FeatureRequest, ForwardedQuestion } from "@/lib/types";

interface Turn {
  role: "user" | "assistant" | "note";
  text: string;
  actionIds?: string[];
  featureIds?: string[];
}

const DIRECTOR_SUGGESTIONS = [
  "How much fees have we collected this week?",
  "Which classes owe the most?",
  "What are parents asking about?",
  "What events are coming up?",
  "Find the parents of Brian Kamau",
];

const SUGGESTIONS = [
  "Check SchoolSync for problems",
  "Why isn't WhatsApp sending messages?",
  "A parent says they can't sign in",
  "Are there M-Pesa payments that didn't match a learner?",
  "I want a new feature",
];

const STATUS: Record<AdminAction["status"], { label: string; cls: string }> = {
  pending: { label: "Waiting for you", cls: "badge urgent" },
  approved: { label: "Done", cls: "badge ok" },
  rejected: { label: "Rejected", cls: "badge" },
  failed: { label: "Failed", cls: "badge urgent" },
};

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function featureText(f: FeatureRequest) {
  return `Feature request for SchoolSync: ${f.title}\n\nWhat the school needs:\n${f.problem}\n\nHow it could work:\n${f.proposal}`;
}

export default function AdminAiChat({
  mode = "admin",
  pending,
  recent,
  featureRequests,
  forwarded,
}: {
  mode?: "admin" | "director";
  pending: AdminAction[];
  recent: AdminAction[];
  featureRequests: FeatureRequest[];
  forwarded: ForwardedQuestion[];
}) {
  const isAdmin = mode === "admin";
  const [questions, setQuestions] = useState<ForwardedQuestion[]>(forwarded);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [actions, setActions] = useState<Record<string, AdminAction>>(() => Object.fromEntries([...pending, ...recent].map((a) => [a.id, a])));
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [features, setFeatures] = useState<FeatureRequest[]>(featureRequests);
  const [deciding, setDeciding] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next: Turn[] = [...turns, { role: "user", text: content }];
    setTurns(next);
    setInput("");
    setBusy(true);
    // Approval notes go to the AI as part of the conversation, so it knows what happened.
    const history = next.map((t) => ({ role: t.role === "assistant" ? "assistant" : "user", text: t.role === "note" ? `[${t.text}]` : t.text }));
    try {
      const res = await fetch("/api/admin-ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ history }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTurns([...next, { role: "assistant", text: data.error ?? "Something went wrong. Please try again." }]);
        return;
      }
      const newActions: AdminAction[] = data.actions ?? [];
      const newFeatures: FeatureRequest[] = data.featureRequests ?? [];
      setActions((a) => ({ ...a, ...Object.fromEntries(newActions.map((x) => [x.id, x])) }));
      setFeatures((f) => [...newFeatures, ...f]);
      const sentOn = (data.forwarded ?? []).length ? [{ role: "note" as const, text: "↪ Forwarded to the administrator." }] : [];
      setTurns([...next, { role: "assistant", text: data.reply, actionIds: newActions.map((x) => x.id), featureIds: newFeatures.map((x) => x.id) }, ...sentOn]);
    } catch {
      setTurns([...next, { role: "assistant", text: "Network error. Please try again." }]);
    } finally {
      setBusy(false);
    }
  }

  async function decide(a: AdminAction, decision: "approve" | "reject") {
    setDeciding(a.id);
    const res = await fetch(`/api/admin-ai/actions/${a.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
    const data = await res.json().catch(() => ({}));
    setDeciding(null);
    if (!res.ok) {
      setTurns((t) => [...t, { role: "note", text: `Couldn't ${decision} "${a.summary}": ${data.error ?? "error"}` }]);
      return;
    }
    const done: AdminAction = data.action;
    setActions((m) => ({ ...m, [done.id]: done }));
    if (data.temporaryPassword) setPasswords((p) => ({ ...p, [done.id]: data.temporaryPassword }));
    const verb = done.status === "approved" ? "Approved" : done.status === "rejected" ? "Rejected" : "Approved but failed";
    setTurns((t) => [...t, { role: "note", text: `${verb}: ${done.summary}. ${done.result ?? ""}`.trim() }]);
  }

  async function setQuestionStatus(q: ForwardedQuestion, status: ForwardedQuestion["status"]) {
    const res = await fetch(`/api/admin-ai/questions/${q.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (res.ok) setQuestions((list) => list.map((x) => (x.id === q.id ? { ...x, status } : x)));
  }

  async function setFeatureStatus(f: FeatureRequest, status: FeatureRequest["status"]) {
    const res = await fetch(`/api/admin-ai/features/${f.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (res.ok) setFeatures((list) => list.map((x) => (x.id === f.id ? { ...x, status } : x)));
  }

  async function removeFeature(f: FeatureRequest) {
    if (!confirm(`Delete the feature request "${f.title}"?`)) return;
    const res = await fetch(`/api/admin-ai/features/${f.id}`, { method: "DELETE" });
    if (res.ok) setFeatures((list) => list.filter((x) => x.id !== f.id));
  }

  const card = (id: string) => {
    const a = actions[id];
    if (!a) return null;
    return (
      <div key={id} className="stack" style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "0.65rem 0.8rem", background: "var(--surface)", gap: 6 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "nowrap" }}>
          <strong style={{ fontSize: "0.92rem" }}>{a.summary}</strong>
          <span className={STATUS[a.status].cls} style={{ whiteSpace: "nowrap" }}>{STATUS[a.status].label}</span>
        </div>
        <div className="small muted">Why: {a.reason}</div>
        {a.status === "pending" ? (
          <div className="row" style={{ gap: 6 }}>
            <button className="small" disabled={deciding === a.id} onClick={() => decide(a, "approve")}>{deciding === a.id ? "Working…" : "Approve"}</button>
            <button className="secondary small" disabled={deciding === a.id} onClick={() => decide(a, "reject")}>Reject</button>
          </div>
        ) : (
          a.result && <div className="small">{a.result}</div>
        )}
        {passwords[a.id] && (
          <div className="small" style={{ background: "var(--surface-2)", padding: "0.5rem", borderRadius: 6 }}>
            Temporary password: <code style={{ fontSize: "1rem" }}>{passwords[a.id]}</code>{" "}
            <button className="link small" onClick={() => navigator.clipboard?.writeText(passwords[a.id])}>Copy</button>
            <div className="muted">Shown only now. Give it to them privately; they&apos;ll choose their own when they sign in.</div>
          </div>
        )}
      </div>
    );
  };

  const waiting = Object.values(actions).filter((a) => a.status === "pending" && !turns.some((t) => t.actionIds?.includes(a.id)));

  return (
    <div className="stack">
      <div className="card chat">
        <div className="chat-log" ref={logRef}>
          {turns.length === 0 && (
            <div className="stack">
              <p className="muted">Describe a problem in your own words, or try:</p>
              <div className="suggestions">
                {(isAdmin ? SUGGESTIONS : DIRECTOR_SUGGESTIONS).map((s) => <button key={s} className="secondary small" onClick={() => send(s)}>{s}</button>)}
              </div>
            </div>
          )}
          {turns.map((t, i) =>
            t.role === "note" ? (
              <div key={i} className="small muted" style={{ alignSelf: "center", textAlign: "center", maxWidth: "90%" }}>{t.text}</div>
            ) : (
              <div key={i} className="stack" style={{ gap: 6, alignSelf: t.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%" }}>
                <div className={`bubble ${t.role}`} style={{ maxWidth: "100%" }}>{t.text}</div>
                {t.actionIds?.map(card)}
                {t.featureIds?.map((id) => {
                  const f = features.find((x) => x.id === id);
                  return f ? <div key={id} className="small" style={{ border: "1px dashed var(--border)", borderRadius: 10, padding: "0.5rem 0.75rem" }}>💡 Saved feature request: <strong>{f.title}</strong> (below)</div> : null;
                })}
              </div>
            ),
          )}
          {busy && <div className="bubble assistant">Looking into it…</div>}
        </div>
        <form className="chat-form" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            placeholder={isAdmin ? "e.g. Ann Njeri says she never got the fee reminder" : "e.g. Who in Grade 7 still owes fees?"}
            rows={2}
          />
          <button type="submit" disabled={busy || !input.trim()}>Send</button>
        </form>
      </div>

      {isAdmin && questions.length > 0 && (
        <div className="card stack">
          <h2>Questions from directors ({questions.filter((q) => q.status === "open").length} open)</h2>
          {questions.map((q) => (
            <div key={q.id} className="stack" style={{ borderTop: "1px solid var(--border)", paddingTop: "0.6rem", gap: 4, opacity: q.status === "answered" ? 0.6 : 1 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>{q.fromName}</strong>
                <span className="small muted">{when(q.createdAt)}</span>
              </div>
              <div style={{ whiteSpace: "pre-wrap" }}>{q.question}</div>
              {q.details && <div className="small muted">{q.details}</div>}
              <div>
                {q.status === "open" ? (
                  <button className="secondary small" onClick={() => setQuestionStatus(q, "answered")}>Mark answered</button>
                ) : (
                  <button className="link small" onClick={() => setQuestionStatus(q, "open")}>Answered · reopen</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {isAdmin && waiting.length > 0 && (
        <div className="card stack">
          <h2>Waiting for your approval</h2>
          {waiting.map((a) => card(a.id))}
        </div>
      )}

      {isAdmin && (
      <div className="card stack">
        <h2>Feature requests</h2>
        {features.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>Tell the Admin AI about something you wish SchoolSync could do; it writes it up here for the developer.</p>
        ) : (
          features.map((f) => (
            <div key={f.id} className="stack" style={{ borderTop: "1px solid var(--border)", paddingTop: "0.6rem", gap: 4 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>{f.title}</strong>
                <span className="small muted">{when(f.createdAt)}</span>
              </div>
              <div className="small" style={{ whiteSpace: "pre-wrap" }}><strong>Need:</strong> {f.problem}</div>
              <div className="small" style={{ whiteSpace: "pre-wrap" }}><strong>Idea:</strong> {f.proposal}</div>
              <div className="row" style={{ gap: 6 }}>
                <button className="secondary small" onClick={() => navigator.clipboard?.writeText(featureText(f))}>Copy for the developer</button>
                <select value={f.status} onChange={(e) => setFeatureStatus(f, e.target.value as FeatureRequest["status"])} aria-label="Status" style={{ width: "auto" }}>
                  <option value="new">New</option>
                  <option value="sent">Sent to developer</option>
                  <option value="done">Done</option>
                </select>
                <button className="danger small" onClick={() => removeFeature(f)}>Delete</button>
              </div>
            </div>
          ))
        )}
      </div>
      )}

      {isAdmin && recent.length > 0 && (
        <details className="card">
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>History of AI-proposed changes</summary>
          <ul className="list small">
            {recent.map((a) => (
              <li key={a.id}>
                <span className={STATUS[a.status].cls}>{STATUS[a.status].label}</span> {a.summary} <span className="muted">· {when(a.proposedAt)}</span>
                {a.result && <div className="muted">{a.result}</div>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
