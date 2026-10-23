"use client";

import { useState } from "react";
import PasswordInput from "@/components/PasswordInput";

/** Erase everything, behind the password, the two-step code and the school's name typed out. */
export default function DangerZone({ school, needsCode }: { school: string; needsCode: boolean }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const nameOk = typed.trim().toLowerCase() === school.trim().toLowerCase();

  async function erase(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/erase-all", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password, code, schoolName: typed }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Couldn't erase; nothing was changed.");
    setDone(`Erased ${data.people} people and ${data.classes} classes. The "Before erase" backup is at the top of School Admin → Backups if you need it back.`);
    setOpen(false);
  }

  return (
    <section className="card stack danger-zone" id="danger-zone" aria-labelledby="danger-title">
      <h2 id="danger-title" style={{ margin: 0 }}>⚠️ Danger zone</h2>
      <p className="small" style={{ margin: 0 }}>
        <strong>Erase everything</strong>: all learners, parents and staff (except you), classes, fees and payments, results,
        announcements, posters, WhatsApp history, documents, assignments, AI history, and the school&apos;s details and logo. Your
        administrator account, the settings and the backups stay. Use it to wipe a practice school, or to reuse the portal for another school.
      </p>
      <p className="small muted" style={{ margin: 0 }}>
        A <strong>&quot;Before erase&quot;</strong> backup is made first: to undo, open School Admin → Backups and click Restore on it.
        Administrators are told on WhatsApp straight away.
      </p>
      {done && <div className="notice small" role="status">✓ {done} <a href="/school">Open Backups →</a></div>}
      {!open ? (
        <div><button type="button" className="danger" id="erase-all-start" onClick={() => { setOpen(true); setDone(null); }}>Erase everything…</button></div>
      ) : (
        <form className="stack erase-all-form" onSubmit={erase}>
          <label>
            Your password (the one you sign in with)
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          {needsCode ? (
            <label>
              Two-step code from your phone
              <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" required />
            </label>
          ) : (
            <div className="small muted">Tip: turn on two-step sign-in in My account, and erasing will also need the code from your phone.</div>
          )}
          <label>
            Type the school&apos;s name to confirm: <strong>{school}</strong>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" required />
          </label>
          {error && <div className="error">{error}</div>}
          <div className="row" style={{ gap: 8 }}>
            <button type="submit" className="danger-solid" disabled={busy || !password || !nameOk || (needsCode && code.trim().length < 6)}>
              {busy ? "Erasing…" : "Erase everything permanently"}
            </button>
            <button type="button" className="link" onClick={() => { setOpen(false); setPassword(""); setCode(""); setTyped(""); setError(null); }}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}
