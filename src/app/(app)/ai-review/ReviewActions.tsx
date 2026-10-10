"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ReviewActions({ id, flagged, reviewed }: { id: string; flagged: boolean; reviewed: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/ai-logs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Couldn't save");
    setBusy(false);
    router.refresh();
  }

  function flag() {
    const note = prompt("What's wrong with this answer? (optional — e.g. the correct fee or date)");
    if (note === null) return;
    update({ flagged: true, note });
  }

  return (
    <div className="row" style={{ gap: "0.4rem" }}>
      {!reviewed && !flagged && (
        <button className="secondary small" disabled={busy} onClick={() => update({ reviewed: true })}>✓ Looks right</button>
      )}
      {flagged ? (
        <button className="secondary small" disabled={busy} onClick={() => update({ flagged: false })}>Unflag</button>
      ) : (
        <button className="danger small" disabled={busy} onClick={flag}>Flag as wrong</button>
      )}
      {error && <span className="error small">{error}</span>}
    </div>
  );
}
