"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import CsvImportCard from "@/components/CsvImportCard";
import { FEES_TEMPLATE_CSV } from "@/lib/importFormat";
import type { FeeStatement } from "@/lib/fees";

interface Learner {
  id: string;
  name: string;
  admissionNo: string | null;
  classId: string | null;
  className: string;
  charged: number;
  paid: number;
  balance: number;
}

const money = (n: number, label: string) => `${n < 0 ? "-" : ""}${label} ${Math.abs(n).toLocaleString("en-US")}`;
const today = () => new Date().toISOString().slice(0, 10);

export default function FeesManager({
  learners,
  classes,
  currency,
  defaultTerm,
  readOnly = false,
}: {
  learners: Learner[];
  classes: { id: string; name: string }[];
  currency: string;
  defaultTerm: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [classFilter, setClassFilter] = useState("");
  const [owingOnly, setOwingOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const shown = learners.filter((l) => (!classFilter || l.classId === classFilter) && (!owingOnly || l.balance > 0));
  const totals = shown.reduce((t, l) => ({ charged: t.charged + l.charged, paid: t.paid + l.paid, balance: t.balance + Math.max(0, l.balance) }), { charged: 0, paid: 0, balance: 0 });

  return (
    <div className="stack">
      <div className="grid grid-3">
        <div className="card"><div className="stat-label">Fees charged</div><div className="stat-value">{money(totals.charged, currency)}</div></div>
        <div className="card"><div className="stat-label">Collected</div><div className="stat-value">{money(totals.paid, currency)}</div></div>
        <div className="card"><div className="stat-label">Outstanding</div><div className="stat-value">{money(totals.balance, currency)}</div></div>
      </div>

      <div className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Learners</h2>
          <div className="row">
            <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} aria-label="Filter by class">
              <option value="">All classes</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label className="checkbox"><input type="checkbox" checked={owingOnly} onChange={(e) => setOwingOnly(e.target.checked)} /> Owing only</label>
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="muted">No learners to show.</p>
        ) : (
          <div className="table-wrap" style={{ maxHeight: 420, overflowY: "auto" }}>
            <table>
              <thead><tr><th>Learner</th><th>Adm. no.</th><th>Class</th><th>Charged</th><th>Paid</th><th>Balance</th><th /></tr></thead>
              <tbody>
                {shown.map((l) => (
                  <tr key={l.id} style={selected === l.id ? { background: "var(--surface-2)" } : undefined}>
                    <td>{l.name}</td>
                    <td className="small">{l.admissionNo ?? "—"}</td>
                    <td className="small">{l.className}</td>
                    <td className="small">{money(l.charged, currency)}</td>
                    <td className="small">{money(l.paid, currency)}</td>
                    <td>
                      <span className={`badge ${l.balance > 0 ? "urgent" : "ok"}`}>
                        {l.balance > 0 ? money(l.balance, currency) : l.balance < 0 ? `Credit ${money(-l.balance, currency)}` : "Paid"}
                      </span>
                    </td>
                    <td><button className="secondary small" onClick={() => setSelected(l.id)}>Statement</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <Statement
          key={selected}
          studentId={selected}
          currency={currency}
          defaultTerm={defaultTerm}
          readOnly={readOnly}
          onClose={() => setSelected(null)}
          onChange={() => router.refresh()}
        />
      )}

      {!readOnly && <ClassCharge classes={classes} currency={currency} defaultTerm={defaultTerm} onDone={() => router.refresh()} />}

      {!readOnly && <CsvImportCard
        title="Upload fees from a spreadsheet"
        description={
          <>
            Columns: <strong>Student name</strong>, <strong>Class</strong>, <strong>Term</strong>, <strong>Fees</strong> (charged) and/or <strong>Paid</strong>, and optionally <strong>Date</strong> (e.g. 14/02/2026; blank means today).
            Each row replaces that learner&apos;s uploaded totals for the term, so you can upload the latest sheet from your fees system again and again.
            Payments recorded by hand here are kept on top, so for each term use either uploads or hand entry for payments, not both.
          </>
        }
        endpoint="/api/fees/import"
        templateName="schoolsync-fees-template.csv"
        templateCsv={FEES_TEMPLATE_CSV}
      />}
    </div>
  );
}

function Statement({
  studentId,
  currency,
  defaultTerm,
  readOnly,
  onClose,
  onChange,
}: {
  readOnly: boolean;
  studentId: string;
  currency: string;
  defaultTerm: string;
  onClose: () => void;
  onChange: () => void;
}) {
  const [data, setData] = useState<{ student: { name: string }; statement: FeeStatement } | null>(null);
  const [form, setForm] = useState({ kind: "payment", amount: "", term: defaultTerm, date: today(), reference: "", note: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    const res = await fetch(`/api/fees/${studentId}`, { cache: "no-store" });
    if (res.ok) setData(await res.json());
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/fees/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, studentId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg({ ok: false, text: body.error ?? "Couldn't save" });
      return;
    }
    setMsg({ ok: true, text: `${form.kind === "payment" ? "Payment" : "Charge"} of ${money(Number(body.entry.amount), currency)} recorded.` });
    setForm({ ...form, amount: "", reference: "", note: "" });
    await load();
    onChange();
  }

  async function remove(id: string) {
    if (!confirm("Delete this entry from the statement?")) return;
    await fetch(`/api/fees/entries/${id}`, { method: "DELETE" });
    await load();
    onChange();
  }

  if (!data) return <div className="card muted">Loading statement…</div>;
  const st = data.statement;
  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>Statement: {data.student.name}</h2>
        <button className="secondary small" onClick={onClose}>Close</button>
      </div>
      <div className="row small">
        <span>Charged <strong>{money(st.charged, currency)}</strong></span>
        <span>Paid <strong>{money(st.paid, currency)}</strong></span>
        <span>Balance <strong>{st.balance >= 0 ? money(st.balance, currency) : `credit ${money(-st.balance, currency)}`}</strong></span>
      </div>
      {st.entries.length === 0 ? (
        <p className="muted small">No entries yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Term</th><th>Type</th><th>Amount</th><th>Reference / note</th><th /></tr></thead>
            <tbody>
              {st.entries.map((e) => (
                <tr key={e.id}>
                  <td className="small">{e.date}</td>
                  <td className="small">{e.term}</td>
                  <td className="small">{e.kind === "payment" ? "Payment" : "Charge"}{e.source !== "manual" ? ` (${e.source === "import" ? "uploaded" : e.source === "mpesa" ? "M-Pesa, automatic" : "class fee"})` : ""}</td>
                  <td className="small">{money(e.amount, currency)}</td>
                  <td className="small">{[e.reference, e.note].filter(Boolean).join(" · ") || "—"}</td>
                  <td>{!readOnly && <button className="danger small" onClick={() => remove(e.id)}>Delete</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!readOnly && <form className="stack" onSubmit={add} style={{ background: "var(--surface-2)", padding: "0.75rem", borderRadius: 8 }}>
        <div className="small" style={{ fontWeight: 600 }}>Record a payment or charge</div>
        <div className="grid grid-3">
          <label>Type<select value={form.kind} onChange={f("kind")}><option value="payment">Payment</option><option value="charge">Charge</option></select></label>
          <label>Amount ({currency})<input value={form.amount} onChange={f("amount")} inputMode="numeric" placeholder="5000" required /></label>
          <label>Term<input value={form.term} onChange={f("term")} required /></label>
          <label>Date<input type="date" value={form.date} onChange={f("date")} /></label>
          <label>Reference (e.g. M-Pesa code)<input value={form.reference} onChange={f("reference")} /></label>
          <label>Note<input value={form.note} onChange={f("note")} /></label>
        </div>
        {msg && <div className={msg.ok ? "small" : "error"}>{msg.ok ? "✅ " : ""}{msg.text}</div>}
        <div><button type="submit">Save</button></div>
      </form>}
    </div>
  );
}

function ClassCharge({ classes, currency, defaultTerm, onDone }: { classes: { id: string; name: string }[]; currency: string; defaultTerm: string; onDone: () => void }) {
  const [form, setForm] = useState({ classId: classes[0]?.id ?? "", term: defaultTerm, amount: "", note: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/fees/class-charge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const body = await res.json().catch(() => ({}));
    setMsg(res.ok ? { ok: true, text: `Charged ${body.learners} learners. Running it again for the same class and term updates the amount.` } : { ok: false, text: body.error ?? "Failed" });
    if (res.ok) onDone();
  }
  return (
    <form className="card stack" onSubmit={submit}>
      <h2>Set a term fee for a whole class</h2>
      <div className="grid grid-3">
        <label>Class<select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Term<input value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} required /></label>
        <label>Amount per learner ({currency})<input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} inputMode="numeric" required /></label>
      </div>
      {msg && <div className={msg.ok ? "small" : "error"}>{msg.ok ? "✅ " : ""}{msg.text}</div>}
      <div><button type="submit" disabled={classes.length === 0}>Charge class</button></div>
    </form>
  );
}
