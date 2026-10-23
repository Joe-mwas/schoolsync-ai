"use client";

import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="secondary small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          prompt("Copy this:", text);
        }
      }}
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}

type Kind = "ai" | "whatsapp-credentials" | "webhook" | "whatsapp-send" | "mpesa-credentials" | "mpesa-register";

export function TestButton({ kind, label, defaultPhone }: { kind: Kind; label: string; defaultPhone?: string }) {
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/setup/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, phone }),
      });
      const data = await res.json().catch(() => ({}));
      setResult(res.ok ? data : { ok: false, message: data.error ?? `Test failed (HTTP ${res.status})` });
    } catch {
      setResult({ ok: false, message: "Network error; check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: "0.4rem" }}>
      <div className="row">
        {kind === "whatsapp-send" && (
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+254712345678" style={{ maxWidth: 200 }} aria-label="Phone number to send the test to" />
        )}
        <button type="button" className="secondary" onClick={run} disabled={busy || (kind === "whatsapp-send" && !phone.trim())}>
          {busy ? "Testing…" : label}
        </button>
      </div>
      {result && (
        <div className="small" role="status" style={{ color: result.ok ? "var(--accent)" : "var(--danger)" }}>
          {result.ok ? "✅ " : "❌ "}
          {result.message}
        </div>
      )}
    </div>
  );
}

/** Make a strong random key in this browser (it never reaches the server) for DATA_ENCRYPTION_KEY. */
export function GenerateKey() {
  const [key, setKey] = useState<string | null>(null);
  function make() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    setKey(btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
  }
  return (
    <div className="stack" style={{ gap: "0.4rem" }}>
      <div><button type="button" className="secondary" onClick={make}>{key ? "Generate another" : "Generate a key"}</button></div>
      {key && (
        <div className="notice stack" style={{ gap: 6 }}>
          <div className="row"><code style={{ wordBreak: "break-all" }}>{key}</code><CopyButton text={key} /></div>
          <div className="small">
            <strong>First save this key somewhere safe</strong> (a password manager, or written down and locked away). Then paste it into
            Render as <code>DATA_ENCRYPTION_KEY</code>. Without it, encrypted backups can never be opened. This key is made in your
            browser and isn&apos;t stored anywhere else.
          </div>
        </div>
      )}
    </div>
  );
}

export function OffsiteBackupButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  async function run() {
    setBusy(true);
    setResult(null);
    const res = await fetch("/api/backups/offsite", { method: "POST" }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    setResult(res?.ok ? { ok: true, message: `Uploaded ${data.status.lastObject} (${Math.ceil(data.status.bytes / 1024)} KB, encrypted).` } : { ok: false, message: data.error ?? "Network error; try again." });
  }
  return (
    <div className="stack" style={{ gap: "0.4rem" }}>
      <div><button type="button" className="secondary" onClick={run} disabled={busy}>{busy ? "Uploading…" : "Back up off-site now"}</button></div>
      {result && (
        <div className="small" role="status" style={{ color: result.ok ? "var(--accent)" : "var(--danger)" }}>
          {result.ok ? "✅ " : "❌ "}
          {result.message}
        </div>
      )}
    </div>
  );
}

const FAMILY_OPTIONS: { value: "economy" | "balanced" | "top"; title: string; detail: string }[] = [
  { value: "economy", title: "Economy · Claude Haiku", detail: "About KSh 0.1 per answer. Best value for everyday questions (fees, dates, uniform)." },
  { value: "balanced", title: "Balanced · Claude Sonnet", detail: "About KSh 2 per answer. Better with long or unusual questions." },
  { value: "top", title: "Top · Claude Opus", detail: "About KSh 4 per answer. The same model staff use." },
];

/** Which Claude model answers parents and learners; staff always get the top model. */
export function FamilyModelPicker({ initial }: { initial: "economy" | "balanced" | "top" }) {
  const [value, setValue] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function choose(v: typeof value) {
    const before = value;
    setValue(v);
    const res = await fetch("/api/ai-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ familyModel: v }) }).catch(() => null);
    if (res?.ok) setMsg({ ok: true, text: "Saved. Parents' and learners' next questions use this model." });
    else {
      setValue(before);
      setMsg({ ok: false, text: "Couldn't save; try again." });
    }
  }
  return (
    <fieldset className="model-picker">
      <legend className="small" style={{ fontWeight: 600 }}>AI for parents and learners (WhatsApp and the AI Assistant)</legend>
      {FAMILY_OPTIONS.map((o) => (
        <label key={o.value} className={`model-option${value === o.value ? " is-on" : ""}`}>
          <input type="radio" name="family-model" id={`family-model-${o.value}`} checked={value === o.value} onChange={() => choose(o.value)} />
          <span>
            <strong>{o.title}</strong>
            <span className="small muted">{o.detail}</span>
          </span>
        </label>
      ))}
      <div className="small muted">Staff, the director&apos;s brief, AI insights and the chat buddy always use the top model.</div>
      {msg && <div className="small" role="status" style={{ color: msg.ok ? "var(--accent)" : "var(--danger)" }}>{msg.ok ? "✓ " : ""}{msg.text}</div>}
    </fieldset>
  );
}

/** Sign-in security for staff: require two-step sign-in, and the auto sign-out time. */
export function SignInSecurityForm({ initial, adminHasTwoStep }: { initial: { requireTwoStep: boolean; idleMinutes: number }; adminHasTwoStep: boolean }) {
  const [settings, setSettings] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function save(next: typeof settings) {
    const before = settings;
    setSettings(next);
    setMsg(null);
    const res = await fetch("/api/security-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    if (res?.ok) setMsg({ ok: true, text: "Saved." });
    else {
      setSettings(before);
      setMsg({ ok: false, text: data?.error ?? "Couldn't save; try again." });
    }
  }
  return (
    <div className="stack" style={{ gap: 12 }}>
      <label className="check-row">
        <input
          type="checkbox"
          id="require-two-step"
          
          checked={settings.requireTwoStep}
          onChange={(e) => save({ ...settings, requireTwoStep: e.target.checked })}
        />
        <span>
          <strong>Require two-step sign-in for all staff</strong>
          <span className="small muted" style={{ display: "block" }}>
            Staff without it are asked to set it up (about a minute, with a free authenticator app) the next time they open the system.
            {!adminHasTwoStep && " Turn it on for your own account first, in My account."}
          </span>
        </span>
      </label>
      <label style={{ maxWidth: 320 }}>
        Sign staff out automatically after no activity for
        <select id="idle-minutes" value={settings.idleMinutes} onChange={(e) => save({ ...settings, idleMinutes: Number(e.target.value) })}>
          {[15, 30, 60, 120].map((m) => <option key={m} value={m}>{m < 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? "" : "s"}`}</option>)}
        </select>
      </label>
      {msg && <div className="small" role="status" style={{ color: msg.ok ? "var(--accent)" : "var(--danger)" }}>{msg.ok ? "✓ " : ""}{msg.text}</div>}
    </div>
  );
}

export interface AiBudgetView {
  spentKsh: number;
  limitKsh: number | null;
  calls: number;
  paused: "off" | "limit" | null;
  creditsOutAt: string | null;
  byFeature: { label: string; ksh: number }[];
  lastMonthKsh: number | null;
}

/** This month's AI spending, the monthly limit, and the manual-mode switch. */
export function AiBudgetCard({ view }: { view: AiBudgetView }) {
  const [limit, setLimit] = useState(view.limitKsh ? String(view.limitKsh) : "");
  const [off, setOff] = useState(view.paused === "off");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(next: { limit: string; off: boolean }) {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/ai-budget", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ monthlyLimitKsh: next.limit.trim() ? Number(next.limit) : null, off: next.off }) }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setBusy(false);
    if (res?.ok) {
      setMsg({ ok: true, text: "Saved." });
      window.location.reload();
    } else setMsg({ ok: false, text: data?.error ?? "Couldn't save; try again." });
  }
  const pct = view.limitKsh ? Math.min(100, Math.round((view.spentKsh / view.limitKsh) * 100)) : null;
  const ksh = (n: number) => `KSh ${n.toLocaleString("en-KE")}`;
  return (
    <div className="stack ai-budget" style={{ gap: 12 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <strong>AI budget this month</strong>
        <span className={`badge ${view.paused || view.creditsOutAt ? "urgent" : "ok"}`}>
          {view.paused === "off" ? "Off · manual mode" : view.paused === "limit" ? "Paused · limit reached" : view.creditsOutAt ? "Credit ran out" : "Running"}
        </span>
      </div>
      <div>
        <span className="budget-figure">{ksh(view.spentKsh)}</span>
        <span className="muted">{view.limitKsh ? ` of ${ksh(view.limitKsh)}` : " spent"} · {view.calls.toLocaleString("en-KE")} AI answer{view.calls === 1 ? "" : "s"}</span>
        {view.lastMonthKsh !== null && <span className="small muted"> · last month {ksh(view.lastMonthKsh)}</span>}
      </div>
      {pct !== null && (
        <div className={`meter${pct >= 100 ? " is-full" : pct >= 80 ? " is-warn" : ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Share of the monthly AI budget used">
          <span style={{ width: `${pct}%` }} />
        </div>
      )}
      {view.creditsOutAt && (
        <div className="notice small">
          Claude said the credit ran out ({new Date(view.creditsOutAt).toLocaleString("en-GB", { timeZone: "Africa/Nairobi" })}). Add credit in the Claude Console → Billing; the AI resumes by itself.
        </div>
      )}
      <form className="row" style={{ gap: 8, alignItems: "flex-end" }} onSubmit={(e) => { e.preventDefault(); save({ limit, off }); }}>
        <label style={{ flex: "0 1 220px" }}>
          Monthly limit (KSh)
          <input id="ai-limit" value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="No limit" />
        </label>
        <button type="submit" className="small" disabled={busy}>Save limit</button>
      </form>
      <div className="small muted">
        You&apos;re warned on WhatsApp at 80%. At the limit the AI pauses until next month and the system carries on in manual mode:
        the WhatsApp menu still gives fees and results, other questions wait in the WhatsApp inbox for the office, and the
        director&apos;s brief goes out as plain figures. Costs are estimates (KSh 130 to the dollar); the Claude Console has the exact bill.
      </div>
      <label className="check-row">
        <input type="checkbox" id="ai-off" checked={off} disabled={busy} onChange={(e) => { setOff(e.target.checked); save({ limit, off: e.target.checked }); }} />
        <span>
          <strong>Switch the AI off (manual mode)</strong>
          <span className="small muted" style={{ display: "block" }}>Everything else keeps working; untick to turn the AI back on.</span>
        </span>
      </label>
      {view.byFeature.length > 0 && (
        <details className="small">
          <summary>Where the money went this month</summary>
          <ul className="list" style={{ marginTop: 6 }}>
            {view.byFeature.map((f) => <li key={f.label} className="row" style={{ justifyContent: "space-between" }}><span>{f.label}</span><span>{ksh(f.ksh)}</span></li>)}
          </ul>
        </details>
      )}
      {msg && <div className="small" role="status" style={{ color: msg.ok ? "var(--accent)" : "var(--danger)" }}>{msg.ok ? "✓ " : ""}{msg.text}</div>}
    </div>
  );
}
