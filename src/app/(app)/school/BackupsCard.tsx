"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Snapshot } from "@/lib/backup";

const REASONS: Record<Snapshot["reason"], string> = {
  daily: "Daily",
  manual: "Manual",
  "before-import": "Before import",
  "before-restore": "Before restore",
  "before-erase": "Before erase",
};

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function BackupsCard({ initial }: { initial: Snapshot[] }) {
  const router = useRouter();
  const [snapshots, setSnapshots] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function refresh() {
    const res = await fetch("/api/backups", { cache: "no-store" });
    if (res.ok) setSnapshots((await res.json()).snapshots);
  }

  async function backupNow() {
    setBusy(true);
    const res = await fetch("/api/backups", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setMsg(res.ok ? { ok: true, text: "Backup saved." } : { ok: false, text: data.error ?? "Backup failed" });
    await refresh();
    setBusy(false);
  }

  async function restore(body: BodyInit | null, label: string, query = "") {
    if (
      !confirm(
        `Restore ${label}?\n\nAll current data (people, announcements, messages) will be replaced by the backup. ` +
          "A backup of the current data is saved first, so you can undo this.",
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/backups/restore${query}`, { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? "Restore failed" });
      return;
    }
    setMsg({ ok: true, text: `Restored ${label} (${data.people} people).` });
    await refresh();
    router.refresh();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await restore(file, `"${file.name}"`);
  }

  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>Backups</h2>
        <div className="row">
          <button className="secondary small" onClick={backupNow} disabled={busy}>Back up now</button>
          <a className="button secondary small" href="/api/backups/download">Download current data</a>
        </div>
      </div>
      <p className="small muted">
        A backup is saved automatically each day there are changes, and before every spreadsheet import and restore. The last{" "}
        {14} daily backups are kept. These live on the same server as the app, so <strong>download a copy to your computer
        regularly</strong> (for example weekly) and keep it somewhere safe. Backups include everyone&apos;s details, so treat
        them as private.
      </p>
      {msg && <div className={msg.ok ? "small" : "error"}>{msg.text}</div>}
      {snapshots.length === 0 ? (
        <p className="muted small">No backups yet. One is made automatically the first time data changes today.</p>
      ) : (
        <div className="table-wrap" style={{ maxHeight: 320, overflowY: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Size</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => (
                <tr key={s.name}>
                  <td className="small">{new Date(s.createdAt).toLocaleString("en-GB")}</td>
                  <td className="small">{REASONS[s.reason]}</td>
                  <td className="small">{formatSize(s.bytes)}</td>
                  <td>
                    <div className="row" style={{ gap: "0.4rem", flexWrap: "nowrap", justifyContent: "flex-end" }}>
                      <a className="button secondary small" href={`/api/backups/download?name=${encodeURIComponent(s.name)}`}>Download</a>
                      <button
                        className="danger small"
                        disabled={busy}
                        onClick={() => restore(null, `the ${REASONS[s.reason].toLowerCase()} backup from ${new Date(s.createdAt).toLocaleString("en-GB")}`, `?name=${encodeURIComponent(s.name)}`)}
                      >
                        Restore
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="row">
        <label className="button secondary small" style={{ cursor: "pointer", fontSize: "inherit" }}>
          Restore from a downloaded file…
          <input type="file" accept=".gz,.json,application/gzip,application/json" onChange={onFile} style={{ display: "none" }} disabled={busy} />
        </label>
      </div>
    </div>
  );
}
