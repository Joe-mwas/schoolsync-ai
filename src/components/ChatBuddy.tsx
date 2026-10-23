"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { AdminAction } from "@/lib/types";

/**
 * The administrator's chat buddy: a bubble in the bottom-right corner on
 * every page that opens a small chat with the Admin AI (quick, short
 * answers). Changes it proposes still wait for an Approve click.
 */

interface Turn {
  role: "user" | "assistant";
  text: string;
  actions?: AdminAction[];
  error?: boolean;
}

const STORE = "schoolsync.buddy";
const SUGGESTIONS = ["What still needs setting up?", "Any sign-in problems today?", "How much fee was collected this week?", "How do I connect WhatsApp?"];

export default function ChatBuddy({ name }: { name: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [unread, setUnread] = useState(false);
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  // Keep the conversation while moving between pages and after a reload (this tab only).
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORE) ?? "null") as { turns?: Turn[]; open?: boolean } | null;
      if (saved?.turns) setTurns(saved.turns);
      if (saved?.open) setOpen(true);
    } catch {
      /* start fresh */
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify({ turns: turns.slice(-40), open }));
    } catch {
      /* not remembered; fine */
    }
  }, [turns, open]);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy, open]);
  useEffect(() => {
    if (open) {
      setUnread(false);
      setTimeout(() => input.current?.focus(), 50);
    }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // The full Admin AI page already is this chat.
  if (pathname.startsWith("/admin-ai")) return null;

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const next: Turn[] = [...turns, { role: "user", text: q }];
    setTurns(next);
    setText("");
    setBusy(true);
    try {
      const history = next.filter((t) => !t.error).map((t) => ({ role: t.role, text: t.text }));
      const res = await fetch("/api/admin-ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ history, fast: true }) });
      const data = await res.json().catch(() => ({}));
      setTurns((t) => [...t, res.ok ? { role: "assistant", text: data.reply, actions: data.actions ?? [] } : { role: "assistant", text: data.error ?? "Something went wrong; try again.", error: true }]);
    } catch {
      setTurns((t) => [...t, { role: "assistant", text: "No connection; check the internet and try again.", error: true }]);
    } finally {
      setBusy(false);
      if (!open) setUnread(true);
    }
  }

  async function decide(a: AdminAction, approve: boolean) {
    const res = await fetch(`/api/admin-ai/actions/${a.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: approve ? "approve" : "reject" }) });
    const data = await res.json().catch(() => ({}));
    const updated: AdminAction = res.ok ? data.action : { ...a, status: "failed", result: data.error ?? "Couldn't do it" };
    if (data.temporaryPassword) setPasswords((p) => ({ ...p, [a.id]: data.temporaryPassword }));
    setTurns((t) => t.map((turn) => (turn.actions?.some((x) => x.id === a.id) ? { ...turn, actions: turn.actions.map((x) => (x.id === a.id ? updated : x)) } : turn)));
  }

  return (
    <>
      {open && (
        <section className="buddy-panel" role="dialog" aria-label="Chat buddy">
          <header className="buddy-head">
            <span className="buddy-avatar" aria-hidden="true">✦</span>
            <div>
              <strong>Chat buddy</strong>
              <span>Ask about the school or the system</span>
            </div>
            <div className="buddy-head-actions">
              {turns.length > 0 && <button type="button" className="buddy-icon" onClick={() => setTurns([])} title="New chat" aria-label="Start a new chat">↺</button>}
              <button type="button" className="buddy-icon" onClick={() => setOpen(false)} title="Close" aria-label="Close the chat">✕</button>
            </div>
          </header>

          <div className="buddy-list" ref={list} aria-live="polite">
            {turns.length === 0 && (
              <div className="buddy-welcome">
                <p>Hi {name.split(" ")[0]} 👋 I can check sign-ins, fees, messages and settings, and suggest fixes for you to approve.</p>
                <div className="buddy-chips">
                  {SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => ask(s)}>{s}</button>)}
                </div>
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className={`buddy-msg ${t.role}${t.error ? " error" : ""}`}>
                <div className="buddy-bubble">{t.text}</div>
                {t.actions?.map((a) => (
                  <div key={a.id} className="buddy-action">
                    <strong>{a.summary}</strong>
                    {a.status === "pending" ? (
                      <div className="row" style={{ gap: 6 }}>
                        <button type="button" className="small" onClick={() => decide(a, true)}>Approve</button>
                        <button type="button" className="secondary small" onClick={() => decide(a, false)}>Reject</button>
                      </div>
                    ) : (
                      <span className="small muted">{a.status === "approved" ? "✓ " : a.status === "failed" ? "✕ " : ""}{a.result ?? a.status}</span>
                    )}
                    {passwords[a.id] && (
                      <span className="small">Temporary password (shown once): <code>{passwords[a.id]}</code></span>
                    )}
                  </div>
                ))}
              </div>
            ))}
            {busy && (
              <div className="buddy-msg assistant">
                <div className="buddy-bubble buddy-typing" aria-label="Thinking"><i /><i /><i /></div>
              </div>
            )}
          </div>

          <form className="buddy-form" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
            <textarea
              ref={input}
              id="buddy-input"
              rows={1}
              value={text}
              placeholder="Ask anything…"
              aria-label="Your question"
              maxLength={2000}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask(text);
                }
              }}
            />
            <button type="submit" disabled={busy || !text.trim()} aria-label="Send">➤</button>
          </form>
          <Link href="/admin-ai" className="buddy-more">Open the full Admin AI →</Link>
        </section>
      )}
      <button
        type="button"
        className={`buddy-fab${open ? " is-open" : ""}`}
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close the chat buddy" : "Open the chat buddy"}
        aria-expanded={open}
      >
        {open ? (
          <span aria-hidden="true">✕</span>
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12Z" />
            <path d="M8.5 11h.01M12 11h.01M15.5 11h.01" strokeWidth="2.6" />
          </svg>
        )}
        {unread && !open && <span className="buddy-dot" aria-label="New reply" />}
      </button>
    </>
  );
}
