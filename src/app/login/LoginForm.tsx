"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Role } from "@/lib/types";

/** In the order of the school's chain of command; the administrator signs in from the same list. */
const ROLE_CHOICES: { role: Role; label: string }[] = [
  { role: "director", label: "Director" },
  { role: "headteacher", label: "Headteacher" },
  { role: "secretary", label: "Secretary" },
  { role: "teacher", label: "Teacher" },
  { role: "parent", label: "Parent" },
  { role: "student", label: "Student" },
  { role: "admin", label: "Administrator" },
];

const DEMO: { role: Role; email: string }[] = [
  { role: "admin", email: "admin@schoolsync.test" },
  { role: "director", email: "director@schoolsync.test" },
  { role: "headteacher", email: "headteacher@schoolsync.test" },
  { role: "secretary", email: "secretary@schoolsync.test" },
  { role: "teacher", email: "teacher@schoolsync.test" },
  { role: "parent", email: "parent@schoolsync.test" },
  { role: "student", email: "student@schoolsync.test" },
];

const STORE_KEY = "schoolsync.signInRole";
const usesPhone = (r: Role | "") => r === "parent" || r === "student";

export default function LoginForm({ demoPassword }: { demoPassword: string | null }) {
  const router = useRouter();
  const [role, setRole] = useState<Role | "">("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Remember the role picked last time on this device (a convenience only).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (saved && ROLE_CHOICES.some((c) => c.role === saved)) setRole(saved as Role);
    } catch {
      /* storage unavailable: start blank */
    }
  }, []);

  async function signIn(r: Role, e: string, p: string) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: e, password: p, role: r }),
    });
    if (res.ok) {
      try {
        localStorage.setItem(STORE_KEY, r);
      } catch {
        /* ignore */
      }
      router.replace("/dashboard");
      router.refresh();
      return;
    }
    const data = await res.json().catch(() => null);
    if (data?.role && ROLE_CHOICES.some((c) => c.role === data.role)) setRole(data.role);
    setError(data?.error ?? "Sign in failed");
    setBusy(false);
  }

  return (
    <div className="stack">
      <form
        className="stack"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (role) signIn(role, email, password);
        }}
      >
        <label>
          Role
          <select value={role} onChange={(e) => { setRole(e.target.value as Role); setError(null); }} required>
            <option value="" disabled>Choose your role</option>
            {ROLE_CHOICES.map((c) => <option key={c.role} value={c.role}>{c.label}</option>)}
          </select>
        </label>
        <label>
          {usesPhone(role) ? "Phone number or email" : "Email"}
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            inputMode={usesPhone(role) ? "tel" : "email"}
            placeholder={usesPhone(role) ? "0712 345 678" : role ? "you@school.ac.ke" : "you@example.com or 0712 345 678"}
          />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={busy || !role}>{busy ? "Signing in…" : "Sign in"}</button>
        {role !== "admin" && (
          <div className="small muted">Forgot your password? Ask the school office to reset it.</div>
        )}
      </form>
      {demoPassword && (
        <div className="stack">
          <div className="small muted">Try a demo account (password: <code>{demoPassword}</code>)</div>
          <div className="demo-accounts">
            {DEMO.map((d) => (
              <button key={d.email} type="button" className="secondary" disabled={busy} onClick={() => signIn(d.role, d.email, demoPassword)}>
                {ROLE_CHOICES.find((c) => c.role === d.role)!.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
