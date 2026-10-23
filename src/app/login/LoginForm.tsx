"use client";

import PasswordInput from "@/components/PasswordInput";
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

export default function LoginForm({ demoPassword, notice = null }: { demoPassword: string | null; notice?: string | null }) {
  const router = useRouter();
  const [role, setRole] = useState<Role | "">("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"signin" | "forgot" | "sent">("signin");
  const [ticket, setTicket] = useState<string | null>(null);
  const [code, setCode] = useState("");

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
    const data = await res.json().catch(() => null);
    if (res.ok) {
      try {
        localStorage.setItem(STORE_KEY, r);
      } catch {
        /* ignore */
      }
      if (data?.twoStep && data.ticket) {
        setTicket(data.ticket);
        setCode("");
        setBusy(false);
        return;
      }
      finish();
      return;
    }
    if (data?.role && ROLE_CHOICES.some((c) => c.role === data.role)) setRole(data.role);
    setError(data?.error ?? "Sign in failed");
    setBusy(false);
  }

  function finish() {
    try {
      localStorage.setItem("schoolsync.lastActive", String(Date.now()));
    } catch {
      /* ignore */
    }
    router.replace("/dashboard");
    router.refresh();
  }

  async function sendCode() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/two-step", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket, code }) });
    const data = await res.json().catch(() => null);
    if (res.ok) return finish();
    if (data?.restart) {
      setTicket(null);
      setPassword("");
    }
    setError(data?.error ?? "Sign in failed");
    setBusy(false);
  }

  if (ticket) {
    return (
      <form className="auth-form" onSubmit={(ev) => { ev.preventDefault(); sendCode(); }}>
        <div>
          <h2 className="auth-subtitle">Two-step sign-in</h2>
          <p className="muted small" style={{ margin: 0 }}>Open your authenticator app and type the 6-digit code for SchoolSync.</p>
        </div>
        <label>
          Code
          <input
            className="auth-code-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            autoFocus
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={9}
            placeholder="123456"
          />
        </label>
        {error && <div className="error">{error}</div>}
        <div className="auth-actions">
          <button type="submit" disabled={busy || code.trim().length < 6}>{busy ? "Checking…" : "Sign in"}</button>
          <button type="button" className="link" onClick={() => { setTicket(null); setError(null); setPassword(""); }}>Back</button>
        </div>
        <p className="small muted" style={{ margin: 0 }}>Lost your phone? Type one of your backup codes instead, or ask the administrator to reset your password.</p>
      </form>
    );
  }

  if (mode !== "signin") {
    return <ForgotPassword role={role} contact={email} sent={mode === "sent"} onSent={() => setMode("sent")} onBack={() => setMode("signin")} />;
  }

  return (
    <div className="auth-stack">
      {notice && <div className="notice small" role="status">{notice}</div>}
      <form
        className="auth-form"
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
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        {error && <div className="error">{error}</div>}
        <div className="auth-actions">
          <button type="submit" disabled={busy || !role}>{busy ? "Signing in…" : "Sign in"}</button>
          {role !== "admin" && (
            <button type="button" className="link" onClick={() => setMode("forgot")}>Forgot your password?</button>
          )}
        </div>
      </form>
      {demoPassword && (
        <div className="auth-demo">
          <div className="small muted">Try a demo account (password: <code>{demoPassword}</code>)</div>
          <div className="demo-accounts">
            {DEMO.map((d) => (
              <button key={d.email} type="button" className="secondary small" disabled={busy} onClick={() => signIn(d.role, d.email, demoPassword)}>
                {ROLE_CHOICES.find((c) => c.role === d.role)!.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Ask the administrator for a new password. The reply is the same whether or not the details match an account. */
function ForgotPassword({ role: initialRole, contact: initialContact, sent, onSent, onBack }: { role: Role | ""; contact: string; sent: boolean; onSent: () => void; onBack: () => void }) {
  const [role, setRole] = useState<Role | "">(initialRole === "admin" ? "" : initialRole);
  const [contact, setContact] = useState(initialContact);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (sent) {
    return (
      <div className="auth-stack">
        <div className="auth-success">
          <strong>Request sent ✅</strong>
          <p>The school&apos;s administrator has your details and will set you a temporary password, then contact you. Sign in with it and choose your own password.</p>
        </div>
        <div className="auth-actions"><button type="button" className="secondary" onClick={onBack}>Back to sign in</button></div>
      </div>
    );
  }

  async function send(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role, contact, name, note }) });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (res.ok) return onSent();
    setError(data?.error ?? "Couldn't send your request. Please try again.");
  }

  return (
    <form className="auth-form" onSubmit={send}>
      <div>
        <h2 className="auth-subtitle">Forgot your password?</h2>
        <p className="muted small" style={{ margin: 0 }}>Leave your details and the school&apos;s administrator will set you a new one.</p>
      </div>
      <label>
        Role
        <select value={role} onChange={(e) => setRole(e.target.value as Role)} required>
          <option value="" disabled>Choose your role</option>
          {ROLE_CHOICES.filter((c) => c.role !== "admin").map((c) => <option key={c.role} value={c.role}>{c.label}</option>)}
        </select>
      </label>
      <label>
        Your name
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="name" placeholder="e.g. Peter Otieno" />
      </label>
      <label>
        Email or phone you sign in with
        <input value={contact} onChange={(e) => setContact(e.target.value)} required maxLength={120} autoComplete="username" placeholder="you@example.com or 0712 345 678" />
      </label>
      <label>
        Anything else? (optional)
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. I'm the Grade 7 East class teacher" />
      </label>
      {error && <div className="error">{error}</div>}
      <div className="auth-actions">
        <button type="submit" disabled={busy}>{busy ? "Sending…" : "Send request"}</button>
        <button type="button" className="link" onClick={onBack}>Back to sign in</button>
      </div>
    </form>
  );
}
