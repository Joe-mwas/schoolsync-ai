"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const DEMO = [
  { label: "Director", email: "director@schoolsync.test" },
  { label: "Teacher", email: "teacher@schoolsync.test" },
  { label: "Parent", email: "parent@schoolsync.test" },
  { label: "Student", email: "student@schoolsync.test" },
];

export default function LoginForm({ demoPassword }: { demoPassword: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(e: string, p: string) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: e, password: p }),
    });
    if (res.ok) {
      router.replace("/dashboard");
      router.refresh();
    } else {
      setError((await res.json().catch(() => null))?.error ?? "Sign in failed");
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <form
        className="stack"
        onSubmit={(ev) => {
          ev.preventDefault();
          signIn(email, password);
        }}
      >
        <label>
          Email or phone number
          <input value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" placeholder="you@example.com or 0712 345 678" />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      {demoPassword && (
        <div className="stack">
          <div className="small muted">Try a demo account (password: <code>{demoPassword}</code>)</div>
          <div className="demo-accounts">
            {DEMO.map((d) => (
              <button key={d.email} type="button" className="secondary" disabled={busy} onClick={() => signIn(d.email, demoPassword)}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
