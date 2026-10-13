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
