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
