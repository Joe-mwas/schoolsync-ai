"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ChangePasswordForm({ required = false }: { required?: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      setMsg({ ok: false, text: "The new passwords don't match" });
      return;
    }
    setBusy(true);
    const res = await fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? "Could not change password" });
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    setMsg({ ok: true, text: "Password changed. You've been signed out on other devices." });
    router.refresh();
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2>{required ? "Choose your own password" : "Change password"}</h2>
      {required && (
        <p className="muted">
          Your account was set up with a temporary password. Please choose a new one to continue.
        </p>
      )}
      <label>
        {required ? "Temporary password" : "Current password"}
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
      </label>
      <label>
        New password (at least 8 characters)
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} autoComplete="new-password" />
      </label>
      <label>
        Confirm new password
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} autoComplete="new-password" />
      </label>
      {msg && <div className={msg.ok ? "small" : "error"}>{msg.text}</div>}
      <div>
        <button type="submit" disabled={busy}>{busy ? "Saving…" : "Change password"}</button>
      </div>
    </form>
  );
}
