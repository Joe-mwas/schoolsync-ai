"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Simulator({ phones }: { phones: { phone: string; label: string }[] }) {
  const router = useRouter();
  const [from, setFrom] = useState(phones[0]?.phone ?? "");
  const [body, setBody] = useState("Hi, when is the next PTA meeting?");
  const [reply, setReply] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setReply(null);
    const res = await fetch("/api/whatsapp/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, body }),
    });
    const data = await res.json().catch(() => ({}));
    setReply(res.ok ? data.reply.body : data.error ?? "Failed");
    setBusy(false);
    router.refresh();
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2>Test an incoming message</h2>
      <p className="small muted">Pretend to be a parent or teacher texting the school number and see how the assistant replies.</p>
      <div className="grid grid-2">
        <label>
          From
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            {phones.map((p) => (
              <option key={p.phone} value={p.phone}>{p.label} · {p.phone}</option>
            ))}
            <option value="+254799999999">Unknown number · +254799999999</option>
          </select>
        </label>
        <label>
          Message
          <input value={body} onChange={(e) => setBody(e.target.value)} required />
        </label>
      </div>
      <div>
        <button type="submit" disabled={busy}>{busy ? "Waiting for reply…" : "Send test message"}</button>
      </div>
      {reply && <div className="bubble assistant">{reply}</div>}
    </form>
  );
}
