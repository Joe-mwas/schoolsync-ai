"use client";

import { useState } from "react";
import WaText from "./WaText";

const PERIODS = [
  { key: "", label: "Since my last brief" },
  { key: "today", label: "Today" },
  { key: "this week", label: "This week" },
  { key: "this month", label: "This month" },
];

export default function BriefCard() {
  const [busy, setBusy] = useState<string | null>(null);
  const [brief, setBrief] = useState<{ text: string; period: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function get(period: string) {
    setBusy(period);
    setError(null);
    const res = await fetch("/api/brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period }) });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.ok) setBrief(data);
    else setError(data.error ?? "Couldn't prepare the brief");
  }

  return (
    <div className="card stack glow">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>Brief me</h2>
        <span className="small muted">Or send &quot;brief&quot; to the school&apos;s WhatsApp number</span>
      </div>
      <div className="row">
        {PERIODS.map((p) => (
          <button key={p.key} className="secondary" disabled={busy !== null} onClick={() => get(p.key)}>
            {busy === p.key ? "Preparing…" : p.label}
          </button>
        ))}
      </div>
      {error && <div className="error">{error}</div>}
      {brief && (
        <div className="bubble assistant" style={{ maxWidth: "100%" }}>
          <WaText text={brief.text} />
        </div>
      )}
    </div>
  );
}
