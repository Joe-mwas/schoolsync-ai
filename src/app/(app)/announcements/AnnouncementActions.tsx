"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AnnouncementActions({ id, sent }: { id: string; sent: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sendWhatsApp() {
    if (sent && !confirm("This was already sent on WhatsApp. Send again?")) return;
    setBusy(true);
    const res = await fetch(`/api/announcements/${id}/whatsapp`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setMsg(res.ok ? summarize(data) : data.error ?? "Failed");
    setBusy(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm("Delete this announcement?")) return;
    setBusy(true);
    const res = await fetch(`/api/announcements/${id}`, { method: "DELETE" });
    if (!res.ok) setMsg((await res.json().catch(() => ({}))).error ?? "Failed");
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="row">
      {msg && <span className="small">{msg}</span>}
      <button className="secondary" disabled={busy} onClick={sendWhatsApp}>Send via WhatsApp</button>
      <button className="danger" disabled={busy} onClick={remove}>Delete</button>
    </div>
  );
}

export function summarize(s: { recipients: number; sent: number; simulated: number; failed: number }): string {
  if (s.recipients === 0) return "No recipients with phone numbers.";
  const parts = [];
  if (s.sent) parts.push(`${s.sent} sent`);
  if (s.simulated) parts.push(`${s.simulated} simulated`);
  if (s.failed) parts.push(`${s.failed} failed`);
  return `WhatsApp: ${parts.join(", ")}`;
}
