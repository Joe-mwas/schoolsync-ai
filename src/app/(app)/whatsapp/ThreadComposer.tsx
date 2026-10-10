"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Type a message as this contact, to see exactly what they'd get back. */
export default function ThreadComposer({ phone, name }: { phone: string; name: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(body: string) {
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/whatsapp/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: phone, body }),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Failed");
    setText("");
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="stack" style={{ gap: "0.4rem" }}>
      <div className="row" style={{ gap: "0.4rem" }}>
        {["Hi", "1", "2", "3"].map((q) => (
          <button key={q} type="button" className="secondary small" disabled={busy} onClick={() => send(q)}>{q}</button>
        ))}
        <span className="small muted">quick replies</span>
      </div>
      <form className="chat-form" onSubmit={(e) => { e.preventDefault(); send(text); }} style={{ marginTop: 0 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Test: type as ${name}…`} style={{ flex: 1 }} aria-label={`Test message as ${name}`} />
        <button type="submit" disabled={busy || !text.trim()}>{busy ? "…" : "Send"}</button>
      </form>
      {error && <div className="error small">{error}</div>}
      <div className="small muted">Test messages run exactly like real ones; with WhatsApp connected, the replies really go to this number.</div>
    </div>
  );
}
