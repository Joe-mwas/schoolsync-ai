"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Row {
  line: number;
  student: string;
  className: string;
  error: string | null;
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Upload a CSV, preview it (nothing saved), then import. Used for results and fees. */
export default function CsvImportCard({
  title,
  description,
  endpoint,
  templateName,
  templateCsv,
  extra = {},
  disabledReason,
}: {
  title: string;
  description: React.ReactNode;
  endpoint: string;
  templateName: string;
  templateCsv: string;
  extra?: Record<string, string>;
  disabledReason?: string | null;
}) {
  const router = useRouter();
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(text: string, dryRun: boolean) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv: text, dryRun, ...extra }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Import failed");
      return null;
    }
    return data as { rows: Row[] };
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setDone(null);
    setRows(null);
    if (/\.xlsx?$/i.test(file.name)) {
      setError('That looks like an Excel file. In Excel choose File → Save As → "CSV UTF-8", then upload the .csv file.');
      return;
    }
    setFileName(file.name);
    const text = await file.text();
    setCsv(text);
    setBusy(true);
    const preview = await send(text, true);
    setBusy(false);
    if (preview) setRows(preview.rows);
  }

  async function runImport() {
    if (!csv) return;
    setBusy(true);
    const result = await send(csv, false);
    setBusy(false);
    if (!result) return;
    const bad = result.rows.filter((r) => r.error).length;
    setDone(`Imported ${result.rows.length - bad} row${result.rows.length - bad === 1 ? "" : "s"}${bad ? `; ${bad} skipped` : ""}.`);
    setRows(bad ? result.rows.filter((r) => r.error) : null);
    setCsv(null);
    router.refresh();
  }

  const bad = rows?.filter((r) => r.error).length ?? 0;
  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>{title}</h2>
        <button className="secondary small" onClick={() => download(templateName, templateCsv)}>Download template</button>
      </div>
      <div className="small muted">{description}</div>
      <div className="row">
        <label className="button secondary" style={{ cursor: disabledReason ? "not-allowed" : "pointer", fontSize: "inherit", opacity: disabledReason ? 0.55 : 1 }}>
          Choose CSV file…
          <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: "none" }} disabled={Boolean(disabledReason) || busy} />
        </label>
        {fileName && <span className="small muted">{fileName}</span>}
        {disabledReason && <span className="small muted">{disabledReason}</span>}
      </div>
      {busy && <div className="small muted">Working…</div>}
      {error && <div className="error">{error}</div>}
      {done && <div className="small">✅ {done}</div>}
      {rows && csv && (
        <div className="notice" style={{ background: "var(--surface-2)", color: "var(--text)" }}>
          <strong>Preview</strong> — nothing saved yet. {rows.length - bad} row{rows.length - bad === 1 ? "" : "s"} ready
          {bad ? `, ${bad} with problems (will be skipped)` : ""}.
        </div>
      )}
      {rows && rows.some((r) => r.error) && (
        <div className="table-wrap" style={{ maxHeight: 260, overflowY: "auto" }}>
          <table>
            <thead><tr><th>Row</th><th>Learner</th><th>Class</th><th>Problem</th></tr></thead>
            <tbody>
              {rows.filter((r) => r.error).map((r) => (
                <tr key={r.line}><td className="small">{r.line}</td><td>{r.student || "—"}</td><td className="small">{r.className || "—"}</td><td className="small error">{r.error}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows && csv && (
        <div className="row">
          <button onClick={runImport} disabled={busy || rows.length === bad}>Import {rows.length - bad} rows</button>
          <button className="secondary" onClick={() => { setRows(null); setCsv(null); setFileName(""); }} disabled={busy}>Cancel</button>
        </div>
      )}
    </div>
  );
}
