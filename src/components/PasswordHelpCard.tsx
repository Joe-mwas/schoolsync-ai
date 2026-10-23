"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Role } from "@/lib/types";

export interface HelpRow {
  id: string;
  name: string;
  contact: string;
  role: string | null;
  roleKey: Role | null;
  note: string;
  account: string;
  matched: boolean;
  createdAt: string;
}

type Option = { id: string; name: string };

/** Roles a sign-in help request can be added as; administrators are added deliberately in School Admin. */
const ADD_ROLES: { role: Role; label: string }[] = [
  { role: "parent", label: "Parent" },
  { role: "student", label: "Learner" },
  { role: "teacher", label: "Teacher" },
  { role: "secretary", label: "Secretary" },
  { role: "headteacher", label: "Headteacher" },
  { role: "director", label: "Director" },
];

/**
 * The administrator's list of "forgot my password" requests from the sign-in
 * page. A matched account gets a temporary password with Reset; someone
 * without an account is added from their details with Add & give password.
 */
export default function PasswordHelpCard({ requests, classes = [], learners = [] }: { requests: HelpRow[]; classes?: Option[]; learners?: Option[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ name: string; signInWith: string; password: string; added: boolean } | null>(null);
  const [adding, setAdding] = useState<{ id: string; role: Role; classId: string; childId: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function act(r: HelpRow, action: "reset" | "add" | "dismiss") {
    if (action === "dismiss" && !confirm(`Dismiss ${r.name}'s request?`)) return;
    setBusy(r.id);
    setError(null);
    const extra = action === "add" && adding ? { role: adding.role, classId: adding.classId, childId: adding.childId } : {};
    const res = await fetch(`/api/password-help/${r.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(data.error ?? "Something went wrong");
    if (action !== "dismiss") {
      setIssued({ name: data.name, signInWith: data.signInWith, password: data.password, added: action === "add" });
      setCopied(false);
    }
    setAdding(null);
    router.refresh();
  }

  function startAdd(r: HelpRow) {
    const role = r.roleKey && r.roleKey !== "admin" ? r.roleKey : "parent";
    setAdding({ id: r.id, role, classId: "", childId: "" });
    setError(null);
  }

  if (requests.length === 0 && !issued) return null;
  const message = issued
    ? `Hello ${issued.name.split(" ")[0]}, your SchoolSync account is ready. Sign in with ${issued.signInWith || "your email or phone"} and this temporary password: ${issued.password} — you'll then choose your own password.`
    : "";
  return (
    <div className="card stack glow">
      <h2 style={{ margin: 0 }}>🔑 Password help ({requests.length})</h2>
      {issued && (
        <div className="notice stack" style={{ gap: 6 }}>
          <div>
            {issued.added ? <>Account created for <strong>{issued.name}</strong>. </> : null}
            Temporary password for <strong>{issued.name}</strong>: <code style={{ fontSize: "1rem" }}>{issued.password}</code>
          </div>
          <div className="small">Send it to them yourself (it isn&apos;t shown again). They sign in with {issued.signInWith || "their email or phone"} and then choose their own password.</div>
          <div className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className="secondary small"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(message);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? "Copied ✓" : "Copy message to send"}
            </button>
            <button type="button" className="link small" onClick={() => setIssued(null)}>Done</button>
          </div>
        </div>
      )}
      {error && <div className="error">{error}</div>}
      {requests.length > 0 && (
        <ul className="list">
          {requests.map((r) => (
            <li key={r.id} className="stack" style={{ gap: 8 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div>
                  <strong>{r.name}</strong>
                  <span className="small muted"> · {new Date(r.createdAt).toLocaleString("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  <div className="small">Signs in with: {r.contact}{r.role ? ` · chose ${r.role}` : ""}</div>
                  <div className={`small ${r.matched ? "" : "muted"}`}>Account: {r.account}</div>
                  {r.note && <div className="small muted">“{r.note}”</div>}
                </div>
                <div className="row" style={{ gap: 6 }}>
                  {r.matched ? (
                    <button className="small" disabled={busy === r.id} onClick={() => act(r, "reset")}>Reset password</button>
                  ) : (
                    adding?.id !== r.id && <button className="small" disabled={busy === r.id} onClick={() => startAdd(r)}>Add &amp; give password</button>
                  )}
                  <button className="secondary small" disabled={busy === r.id} onClick={() => act(r, "dismiss")}>Dismiss</button>
                </div>
              </div>
              {adding?.id === r.id && (
                <form className="add-from-request" onSubmit={(e) => { e.preventDefault(); act(r, "add"); }}>
                  <label>
                    Add {r.name} as
                    <select value={adding.role} onChange={(e) => setAdding({ ...adding, role: e.target.value as Role, classId: "", childId: "" })}>
                      {ADD_ROLES.map((o) => <option key={o.role} value={o.role}>{o.label}</option>)}
                    </select>
                  </label>
                  {(adding.role === "student" || adding.role === "teacher") && (
                    <label>
                      Class
                      <select value={adding.classId} onChange={(e) => setAdding({ ...adding, classId: e.target.value })}>
                        <option value="">Choose later (optional)</option>
                        {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </label>
                  )}
                  {adding.role === "parent" && (
                    <label>
                      Their child
                      <select value={adding.childId} onChange={(e) => setAdding({ ...adding, childId: e.target.value })}>
                        <option value="">Link later (optional)</option>
                        {learners.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </label>
                  )}
                  <div className="row" style={{ gap: 6, alignItems: "flex-end" }}>
                    <button type="submit" className="small" disabled={busy === r.id}>{busy === r.id ? "Adding…" : "Add and create password"}</button>
                    <button type="button" className="link small" onClick={() => setAdding(null)}>Cancel</button>
                  </div>
                  <div className="small muted" style={{ flexBasis: "100%" }}>
                    Only add people you know belong to the school. Staff need an email address to sign in.
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
