"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface HelpRow {
  id: string;
  name: string;
  contact: string;
  role: string | null;
  note: string;
  account: string;
  matched: boolean;
  createdAt: string;
}

/** The administrator's list of "forgot my password" requests from the sign-in page. */
export default function PasswordHelpCard({ requests }: { requests: HelpRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ name: string; signInWith: string; password: string } | null>(null);

  async function act(r: HelpRow, action: "reset" | "dismiss") {
    if (action === "dismiss" && !confirm(`Dismiss ${r.name}'s request?`)) return;
    setBusy(r.id);
    setError(null);
    const res = await fetch(`/api/password-help/${r.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(data.error ?? "Something went wrong");
    if (action === "reset") setIssued({ name: data.name, signInWith: data.signInWith, password: data.password });
    router.refresh();
  }

  if (requests.length === 0 && !issued) return null;
  return (
    <div className="card stack" style={{ borderColor: "var(--primary)" }}>
      <h2 style={{ margin: 0 }}>🔑 Password help ({requests.length})</h2>
      {issued && (
        <div className="notice">
          New temporary password for <strong>{issued.name}</strong>: <code style={{ fontSize: "1rem" }}>{issued.password}</code>
          <div className="small">Send it to them yourself (it isn&apos;t shown again). They sign in with {issued.signInWith || "their email or phone"} and then choose their own password.</div>
          <button className="link small" onClick={() => setIssued(null)}>Done</button>
        </div>
      )}
      {error && <div className="error">{error}</div>}
      {requests.length > 0 && (
        <ul className="list">
          {requests.map((r) => (
            <li key={r.id} className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "nowrap" }}>
              <div>
                <strong>{r.name}</strong>
                <span className="small muted"> · {new Date(r.createdAt).toLocaleString("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                <div className="small">Signs in with: {r.contact}{r.role ? ` · chose ${r.role}` : ""}</div>
                <div className={`small ${r.matched ? "" : "error"}`}>Account: {r.account}</div>
                {r.note && <div className="small muted">“{r.note}”</div>}
              </div>
              <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                {r.matched && <button className="small" disabled={busy === r.id} onClick={() => act(r, "reset")}>Reset password</button>}
                <button className="secondary small" disabled={busy === r.id} onClick={() => act(r, "dismiss")}>Dismiss</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
