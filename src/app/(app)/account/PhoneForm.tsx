"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function PhoneForm({ initial }: { initial: string }) {
  const router = useRouter();
  const [phone, setPhone] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const data = await res.json().catch(() => ({}));
    setMsg(res.ok ? { ok: true, text: "Saved" } : { ok: false, text: data.error ?? "Could not save" });
    if (res.ok) router.refresh();
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2>WhatsApp number</h2>
      <p className="small muted">Used to send you school announcements and to recognise your messages to the school.</p>
      <label>
        Phone (international format)
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+254700000000" />
      </label>
      {msg && <div className={msg.ok ? "small" : "error"}>{msg.text}</div>}
      <div><button type="submit">Save number</button></div>
    </form>
  );
}
