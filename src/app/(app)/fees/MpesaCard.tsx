"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MpesaMatch, MpesaPayment } from "@/lib/types";

const MATCHED: Record<MpesaMatch, string> = { admission: "Admission no.", name: "Learner's name", phone: "Parent's phone", manual: "Matched by hand" };

const money = (n: number, label: string) => `${label} ${n.toLocaleString("en-US")}`;
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** M-Pesa Paybill payments: the ones that need a learner, recent ones, and a test form. */
export default function MpesaCard({
  status,
  paybill,
  currency,
  learners,
  names,
  payments,
}: {
  status: "live" | "sandbox" | "off";
  paybill: string;
  currency: string;
  learners: { id: string; label: string }[];
  names: Record<string, string>;
  payments: MpesaPayment[];
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState({ amount: "5000", account: "", payerName: "" });
  const unmatched = payments.filter((p) => p.status === "unmatched");
  const recent = payments.filter((p) => p.status === "recorded").slice(0, 15);

  async function post(url: string, body: unknown, done: (data: Record<string, unknown>) => string) {
    setBusy(true);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? { ok: true, text: done(data) } : { ok: false, text: data.error ?? "Something went wrong" });
    if (res.ok) router.refresh();
  }

  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>M-Pesa payments</h2>
        {status === "live" ? (
          <span className="badge ok">Automatic · Paybill {paybill}</span>
        ) : status === "sandbox" ? (
          <span className="badge urgent">Sandbox (test money) · {paybill}</span>
        ) : (
          <span className="badge">Not connected: see Setup</span>
        )}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Parents pay to the Paybill with the learner&apos;s <strong>admission number</strong> as the account number. Each payment is
        added to the learner&apos;s fees and the parent gets a WhatsApp receipt with the new balance. Payments whose account number
        doesn&apos;t match a learner wait below for you.
      </p>

      {msg && <div className={msg.ok ? "notice" : "error"}>{msg.text}</div>}

      {unmatched.length > 0 && (
        <div className="stack">
          <h3 style={{ margin: 0 }}>Needs a learner ({unmatched.length})</h3>
          {unmatched.map((p) => (
            <UnmatchedRow key={p.id} p={p} currency={currency} learners={learners} busy={busy} post={post} />
          ))}
        </div>
      )}

      <div className="stack">
        <h3 style={{ margin: 0 }}>Recently recorded</h3>
        {recent.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>No M-Pesa payments yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>When</th><th>Learner</th><th>Amount</th><th>M-Pesa ref</th><th>Paid by</th><th>Matched by</th></tr></thead>
              <tbody>
                {recent.map((p) => (
                  <tr key={p.id}>
                    <td className="small">{when(p.paidAt)}</td>
                    <td>{names[p.studentId ?? ""] ?? "—"}</td>
                    <td>{money(p.amount, currency)}</td>
                    <td className="small"><code>{p.transId}</code>{p.test && <span className="badge" style={{ marginLeft: 6 }}>Test</span>}</td>
                    <td className="small">{p.payerName || "—"}{p.account ? ` · acc ${p.account}` : ""}</td>
                    <td className="small">{p.matchedBy ? MATCHED[p.matchedBy] : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <details>
        <summary className="small" style={{ cursor: "pointer", fontWeight: 600 }}>Test a payment</summary>
        <form
          className="stack"
          style={{ marginTop: "0.75rem" }}
          onSubmit={(e) => {
            e.preventDefault();
            post("/api/payments/simulate", test, (d) =>
              d.outcome === "recorded"
                ? "Test payment recorded in the learner's fees, and a receipt went to the parent on WhatsApp (see the WhatsApp page)."
                : "No learner matched that account number, so it's waiting under \"Needs a learner\".",
            );
          }}
        >
          <div className="small muted">Runs exactly like a real Paybill payment (matching, fees, WhatsApp receipt) but marked as a test.</div>
          <div className="grid grid-3">
            <label>Amount<input value={test.amount} onChange={(e) => setTest({ ...test, amount: e.target.value })} inputMode="numeric" required /></label>
            <label>Account number typed<input value={test.account} onChange={(e) => setTest({ ...test, account: e.target.value })} placeholder="e.g. 1001" /></label>
            <label>Payer&apos;s name<input value={test.payerName} onChange={(e) => setTest({ ...test, payerName: e.target.value })} placeholder="e.g. James Kamau" /></label>
          </div>
          <div><button type="submit" className="secondary" disabled={busy}>Send test payment</button></div>
        </form>
      </details>
    </div>
  );
}

function UnmatchedRow({
  p,
  currency,
  learners,
  busy,
  post,
}: {
  p: MpesaPayment;
  currency: string;
  learners: { id: string; label: string }[];
  busy: boolean;
  post: (url: string, body: unknown, done: (data: Record<string, unknown>) => string) => Promise<void>;
}) {
  const [studentId, setStudentId] = useState("");
  return (
    <div className="row" style={{ justifyContent: "space-between", background: "var(--surface-2)", padding: "0.6rem 0.75rem", borderRadius: 8 }}>
      <div className="small">
        <strong>{money(p.amount, currency)}</strong> from {p.payerName || "unknown"} · account typed: <strong>{p.account || "(blank)"}</strong>
        <div className="muted">{when(p.paidAt)} · ref <code>{p.transId}</code>{p.test ? " · test" : ""}</div>
      </div>
      <div className="row" style={{ gap: "0.4rem" }}>
        <select value={studentId} onChange={(e) => setStudentId(e.target.value)} aria-label="Learner">
          <option value="">Choose learner…</option>
          {learners.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
        <button
          className="small"
          disabled={busy || !studentId}
          onClick={() => post(`/api/payments/${p.id}/assign`, { studentId }, () => `Recorded ${money(p.amount, currency)} and sent the parent a receipt.`)}
        >
          Record
        </button>
        <button
          className="secondary small"
          disabled={busy}
          onClick={() => confirm("Not a school-fees payment? It will be removed from this list (nothing is recorded).") && post(`/api/payments/${p.id}/ignore`, {}, () => "Removed from the list.")}
        >
          Not fees
        </button>
      </div>
    </div>
  );
}
