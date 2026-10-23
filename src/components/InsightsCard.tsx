"use client";

import { useEffect, useRef, useState } from "react";
import type { SavedInsights } from "@/lib/types";

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} hour${h === 1 ? "" : "s"} ago` : `${Math.round(h / 24)} day${h < 48 ? "" : "s"} ago`;
};

/**
 * "AI insights" under the dashboard charts. Shows the saved insights when
 * they still match the figures; otherwise asks for fresh ones once, on its own.
 */
export default function InsightsCard({ initial, stale, aiReady }: { initial: SavedInsights | null; stale: boolean; aiReady: boolean }) {
  const [insights, setInsights] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const asked = useRef(false);

  async function load(refresh: boolean) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (res?.ok) setInsights(data.insights);
    else setError(data.error ?? "No connection; try again.");
  }

  useEffect(() => {
    if (stale && aiReady && !asked.current) {
      asked.current = true;
      void load(false);
    }
  }, [stale, aiReady]);

  const sections: { key: keyof Pick<SavedInsights, "goingWell" | "needsAttention" | "nextSteps">; title: string; mark: string; cls: string }[] = [
    { key: "goingWell", title: "Going well", mark: "✓", cls: "good" },
    { key: "needsAttention", title: "Needs attention", mark: "!", cls: "warn" },
    { key: "nextSteps", title: "What to do next", mark: "→", cls: "next" },
  ];

  return (
    <section className="card insights glow" aria-labelledby="insights-title" aria-busy={busy}>
      <header className="insights-head">
        <div>
          <h2 id="insights-title"><span className="insights-spark" aria-hidden="true">✦</span> AI insights</h2>
          <p className="viz-sub">
            {insights ? `Written from the figures above · ${ago(insights.generatedAt)}` : "What the figures above are saying"}
          </p>
        </div>
        {aiReady && (
          <button type="button" className="secondary small" onClick={() => load(true)} disabled={busy}>
            {busy ? "Reading the figures…" : insights ? "Refresh" : "Get insights"}
          </button>
        )}
      </header>
      {!aiReady && !insights && <p className="small muted" style={{ margin: 0 }}>Connect Claude (Setup → Connections &amp; security) and the AI will explain these figures here.</p>}
      {error && <div className="error">{error}</div>}
      {busy && !insights && (
        <div className="insights-grid" aria-hidden="true">
          {sections.map((s) => <div key={s.key} className="insights-col"><div className="bone" style={{ height: 16, width: "50%" }} /><div className="bone" style={{ height: 52 }} /></div>)}
        </div>
      )}
      {insights && (
        <div className={`insights-grid${busy ? " is-refreshing" : ""}`}>
          {sections.map((s) => (
            <div key={s.key} className={`insights-col ${s.cls}`}>
              <h3><span className="insights-mark" aria-hidden="true">{s.mark}</span>{s.title}</h3>
              {insights[s.key].length === 0 ? (
                <p className="small muted" style={{ margin: 0 }}>Nothing to add.</p>
              ) : (
                <ul>{insights[s.key].map((t, i) => <li key={i}>{t}</li>)}</ul>
              )}
            </div>
          ))}
        </div>
      )}
      {insights && <p className="small muted" style={{ margin: 0 }}>Written by AI from the charts&apos; own figures. Check anything important before acting on it.</p>}
    </section>
  );
}
