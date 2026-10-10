"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ImportReport } from "@/lib/importer";
import { credentialsCsv, TEMPLATE_CSV } from "@/lib/importFormat";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : word.endsWith("s") ? "es" : "s"}`;

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ImportCard() {
  const router = useRouter();
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportReport | null>(null);
  const [result, setResult] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(text: string, dryRun: boolean): Promise<ImportReport | null> {
    const res = await fetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv: text, dryRun }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Import failed");
      return null;
    }
    return data as ImportReport;
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) {
      setError('That looks like an Excel file. In Excel choose File → Save As → "CSV UTF-8", then upload the .csv file.');
      return;
    }
    setError(null);
    setResult(null);
    setPreview(null);
    setFileName(file.name);
    const text = await file.text();
    setCsv(text);
    setBusy("preview");
    setPreview(await send(text, true));
    setBusy(null);
  }

  async function runImport() {
    if (!csv) return;
    setBusy("import");
    setError(null);
    const report = await send(csv, false);
    setBusy(null);
    if (report) {
      setResult(report);
      setPreview(null);
      setCsv(null);
      router.refresh();
    }
  }

  const s = preview?.summary;
  const changes = s ? s.newStudents + s.newParents + s.newClasses + s.linkedParents : 0;

  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>Import from a spreadsheet</h2>
        <button className="secondary small" onClick={() => download("schoolsync-import-template.csv", TEMPLATE_CSV)}>
          Download template
        </button>
      </div>
      <p className="small muted">
        One row per student with their class, and optionally a parent&apos;s name and phone number. Missing classes are created;
        brothers and sisters with the same parent phone share one parent account; re-importing the same file adds nothing twice.
        Parents sign in with their phone number. In Excel or Google Sheets, save or download the sheet as <strong>CSV</strong>.
      </p>
      <div className="row">
        <label className="button secondary" style={{ cursor: "pointer", fontSize: "inherit" }}>
          Choose CSV file…
          <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: "none" }} />
        </label>
        {fileName && <span className="small muted">{fileName}</span>}
      </div>
      {busy === "preview" && <div className="small muted">Checking the file…</div>}
      {error && <div className="error">{error}</div>}

      {preview && s && (
        <div className="stack">
          <div className="notice" style={{ background: "var(--surface-2)", color: "var(--text)" }}>
            <strong>Preview</strong> — nothing has been saved yet. {plural(s.rows, "row")}: {plural(s.newStudents, "new student")},{" "}
            {plural(s.newParents, "new parent")}, {plural(s.newClasses, "new class")}, {plural(s.linkedParents, "parent link")}
            {s.unchanged ? `, ${s.unchanged} already up to date` : ""}
            {s.errors ? `. ${plural(s.errors, "row")} with problems will be skipped.` : "."}
          </div>
          <ReportTable report={preview} />
          <div className="row">
            <button onClick={runImport} disabled={busy !== null || changes === 0}>
              {busy === "import" ? "Importing…" : changes === 0 ? "Nothing to import" : `Import ${plural(s.rows - s.errors - s.unchanged, "row")}`}
            </button>
            <button className="secondary" onClick={() => { setPreview(null); setCsv(null); setFileName(""); }} disabled={busy !== null}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="stack">
          <div className="notice" style={{ background: "var(--surface-2)", color: "var(--text)" }}>
            <strong>Imported.</strong> Added {plural(result.summary.newStudents, "student")}, {plural(result.summary.newParents, "parent")} and{" "}
            {plural(result.summary.newClasses, "class")}; {plural(result.summary.linkedParents, "parent link")}.
            {result.summary.errors ? ` ${plural(result.summary.errors, "row")} skipped (see below).` : ""}
          </div>
          {result.credentials.length > 0 && (
            <div className="notice">
              <strong>Download the sign-in details now.</strong> They contain each new person&apos;s temporary password and are only
              shown once. Share each one privately; everyone chooses their own password at first sign-in.
              <div style={{ marginTop: 8 }}>
                <button onClick={() => download("schoolsync-sign-in-details.csv", credentialsCsv(result.credentials))}>
                  Download sign-in details ({result.credentials.length})
                </button>
              </div>
            </div>
          )}
          {result.summary.errors > 0 && <ReportTable report={result} errorsOnly />}
        </div>
      )}
    </div>
  );
}

function ReportTable({ report, errorsOnly = false }: { report: ImportReport; errorsOnly?: boolean }) {
  const rows = errorsOnly ? report.rows.filter((r) => r.error) : report.rows;
  return (
    <div className="table-wrap" style={{ maxHeight: 360, overflowY: "auto" }}>
      <table>
        <thead>
          <tr>
            <th>Row</th>
            <th>Student</th>
            <th>Class</th>
            <th>Parent</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.line}>
              <td className="small">{r.line}</td>
              <td>{r.student || "—"}</td>
              <td className="small">{r.className || "—"}</td>
              <td className="small">
                {r.parent || (r.parentContact ? "" : "—")}
                {r.parentContact && <div className="muted">{r.parentContact}</div>}
              </td>
              <td className="small">{r.error ? <span className="error">{r.error}</span> : r.actions.join(" · ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
