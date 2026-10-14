"use client";

import { useState } from "react";
import WaText from "@/components/WaText";

interface Preview {
  sending: boolean;
  parents: number;
  learners: number;
  totalOwed: number;
  recentlyReminded: number;
  unreachable: { name: string; className: string; balance: number }[];
  sample: string | null;
  recipients: { name: string; children: string; owed: number }[];
}

const money = (n: number, label: string) => `${label} ${n.toLocaleString("en-US")}`;

/** Remind every parent who owes, on WhatsApp, after a preview. */
export default function RemindersCard({
  classes,
  currency,
  last,
}: {
  classes: { id: string; name: string }[];
  currency: string;
  last: { at: string; count: number } | null;
}) {
  const [form, setForm] = useState({ classId: "", minBalance: "1", skipDays: "7", note: "" });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [k]: e.target.value });
    setPreview(null);
    setSent(null);
  };

  async function call(action: "preview" | "send") {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/fees/reminders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...form }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Something went wrong");
    if (action === "send") {
      setPreview(null);
      setSent(`Sending to ${data.parents} parent${data.parents === 1 ? "" : "s"} now. Each message appears on the WhatsApp page as it goes out.`);
    } else setPreview(data);
  }

  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>Fee reminders</h2>
        {last && <span className="small muted">Last sent {new Date(last.at).toLocaleString("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} to {last.count} parent{last.count === 1 ? "" : "s"}</span>}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        One polite WhatsApp message per parent, listing each child who owes and how to pay. Preview first; nothing is sent until you confirm.
      </p>
      <div className="grid grid-3">
        <label>
          Who
          <select value={form.classId} onChange={set("classId")}>
            <option value="">Whole school</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>
          Balance of at least ({currency})
          <input value={form.minBalance} onChange={set("minBalance")} inputMode="numeric" />
        </label>
        <label>
          Skip parents reminded in the last
          <select value={form.skipDays} onChange={set("skipDays")}>
            <option value="0">— don&apos;t skip anyone</option>
            <option value="3">3 days</option>
            <option value="7">7 days</option>
            <option value="14">14 days</option>
          </select>
        </label>
      </div>
      <label>
        Extra line (optional)
        <textarea value={form.note} onChange={set("note")} rows={2} maxLength={300} placeholder="e.g. Please clear the balance by Friday 31 October." />
      </label>
      <div className="row">
        <button className="secondary" onClick={() => call("preview")} disabled={busy}>{busy && !preview ? "Checking…" : "Preview reminders"}</button>
        {sent && <span className="small">✅ {sent}</span>}
      </div>
      {error && <div className="error">{error}</div>}

      {preview && (
        <div className="stack" style={{ background: "var(--surface-2)", padding: "0.75rem", borderRadius: 8 }}>
          {preview.parents === 0 ? (
            <div className="small">No parents to remind{preview.recentlyReminded ? ` (${preview.recentlyReminded} ${preview.recentlyReminded === 1 ? "was" : "were"} reminded recently)` : ""}.</div>
          ) : (
            <>
              <div>
                <strong>{preview.parents} parent{preview.parents === 1 ? "" : "s"}</strong> will be reminded about {preview.learners} learner{preview.learners === 1 ? "" : "s"}
                <span className="small muted"> · {money(preview.totalOwed, currency)} owed in total{preview.recentlyReminded ? ` · ${preview.recentlyReminded} skipped (reminded recently)` : ""}</span>
              </div>
              {preview.sample && (
                <div className="stack" style={{ gap: 4 }}>
                  <div className="small muted">Example message:</div>
                  <div style={{ background: "#dcf8c6", color: "#111", padding: "0.6rem 0.75rem", borderRadius: 8, maxWidth: 460, fontSize: "0.9rem", whiteSpace: "pre-wrap" }}>
                    <WaText text={preview.sample} />
                  </div>
                </div>
              )}
              <details>
                <summary className="small" style={{ cursor: "pointer" }}>{preview.parents === 1 ? "See who" : `See all ${preview.parents} parents`}</summary>
                <ul className="list small">
                  {preview.recipients.map((r, i) => <li key={i}>{r.name} — {r.children} · {money(r.owed, currency)}</li>)}
                </ul>
              </details>
              <div>
                <button onClick={() => confirm(`Send fee reminders to ${preview.parents} parent${preview.parents === 1 ? "" : "s"} on WhatsApp?`) && call("send")} disabled={busy}>
                  Send to {preview.parents} parent{preview.parents === 1 ? "" : "s"}
                </button>
              </div>
            </>
          )}
          {preview.unreachable.length > 0 && (
            <div className="small">
              <strong>Not on WhatsApp ({preview.unreachable.length}):</strong> these learners owe but have no parent with a WhatsApp number. Call the
              family or add the number in School Admin.
              <ul className="list">
                {preview.unreachable.map((u, i) => <li key={i}>{u.name} ({u.className}) · {money(u.balance, currency)}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
