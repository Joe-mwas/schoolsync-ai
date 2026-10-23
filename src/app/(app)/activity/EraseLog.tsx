"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import PasswordInput from "@/components/PasswordInput";

/** Erase the activity log, after typing the sign-in password. */
export default function EraseLog({ count }: { count: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function erase(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/activity", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Couldn't erase it; try again.");
    setOpen(false);
    setPassword("");
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" className="danger small" id="erase-log" disabled={count === 0} onClick={() => setOpen(true)}>
        Erase the log
      </button>
    );
  }
  return (
    <form className="card stack erase-log" onSubmit={erase}>
      <strong>Erase all {count.toLocaleString("en-KE")} entries?</strong>
      <span className="small muted">
        This can&apos;t be undone from here. A backup is made first, and the log will start again with one entry saying you erased it.
      </span>
      <label>
        Your password (the one you sign in with)
        <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required autoFocus />
      </label>
      {error && <div className="error">{error}</div>}
      <div className="row" style={{ gap: 8 }}>
        <button type="submit" className="danger" disabled={busy || !password}>{busy ? "Erasing…" : "Erase everything"}</button>
        <button type="button" className="link" onClick={() => { setOpen(false); setPassword(""); setError(null); }}>Cancel</button>
      </div>
    </form>
  );
}
