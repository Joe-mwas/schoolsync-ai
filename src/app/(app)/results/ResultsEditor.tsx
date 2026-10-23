"use client";

import { useCallback, useEffect, useState } from "react";
import CsvImportCard from "@/components/CsvImportCard";
import { LEVEL_OPTIONS, LEVEL_NAMES, levelFromPercent } from "@/lib/cbc";
import { ASSESSMENT_TYPES, type AssessmentType } from "@/lib/types";
import { RESULTS_TEMPLATE_CSV } from "@/lib/importFormat";

interface Student {
  id: string;
  name: string;
  levels: Record<string, string>;
  comment: string;
}
interface Grid {
  exam: string;
  exams: string[];
  info: { type: AssessmentType; outOf: number | null };
  types: Record<string, AssessmentType>;
  areas: string[];
  students: Student[];
}

const NEW = "__new__";

export default function ResultsEditor({ classes, readOnly = false }: { classes: { id: string; name: string }[]; readOnly?: boolean }) {
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [examChoice, setExamChoice] = useState("");
  const [newExam, setNewExam] = useState("");
  const [grid, setGrid] = useState<Grid | null>(null);
  const [areas, setAreas] = useState<string[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [newArea, setNewArea] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [type, setType] = useState<AssessmentType>("quiz");
  const [outOf, setOutOf] = useState("");
  const marks = Number(outOf) > 0 ? Number(outOf) : null;

  const exam = examChoice === NEW ? newExam.trim() : examChoice;

  const load = useCallback(async (cls: string, ex: string, fresh = false) => {
    if (!cls) return;
    const qs = new URLSearchParams({ classId: cls });
    if (ex) qs.set("exam", ex);
    const res = await fetch(`/api/results?${qs}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? "Couldn't load results" });
      return;
    }
    setGrid(data);
    setAreas(data.areas);
    setDirty(false);
    // A new exam starts blank (same learners and columns), as a quiz entered in levels.
    if (fresh) {
      setType("quiz");
      setOutOf("");
      setStudents(data.students.map((st: Student) => ({ ...st, levels: {}, comment: "" })));
      return;
    }
    setType(data.info.type);
    setOutOf(data.info.outOf ? String(data.info.outOf) : "");
    setStudents(data.students);
    if (!ex) setExamChoice(data.exam || NEW);
  }, []);

  useEffect(() => {
    load(classId, examChoice === NEW ? "" : examChoice, examChoice === NEW);
    // Only reload when the class or a saved exam is picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, examChoice === NEW ? NEW : examChoice]);

  function setLevel(sid: string, area: string, level: string) {
    setStudents((list) => list.map((s) => (s.id === sid ? { ...s, levels: { ...s.levels, [area]: level } } : s)));
    setDirty(true);
  }

  function addArea() {
    const a = newArea.trim();
    if (a && !areas.some((x) => x.toLowerCase() === a.toLowerCase())) setAreas([...areas, a]);
    setNewArea("");
  }

  async function save() {
    if (!exam) {
      setMsg({ ok: false, text: "Name the exam or assessment first, e.g. Term 1 2027 End-term" });
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/results", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classId,
        exam,
        type,
        outOf: marks,
        rows: students.map((s) => ({ studentId: s.id, levels: Object.fromEntries(areas.map((a) => [a, s.levels[a] ?? ""])), comment: s.comment })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? "Save failed" });
      return;
    }
    setMsg({ ok: true, text: `Saved ${data.saved} results for ${exam}. Parents can now see them under Results in the portal, and on WhatsApp (reply 1).` });
    setDirty(false);
    if (examChoice === NEW) {
      setExamChoice(exam);
      setNewExam("");
    }
  }

  if (classes.length === 0) return <p className="muted">You don&apos;t have any classes yet. A director can assign you to a class in School Admin.</p>;

  return (
    <div className="stack">
      <div className="card stack">
        <div className="grid grid-3">
          <label>
            Class
            <select value={classId} onChange={(e) => { setClassId(e.target.value); setExamChoice(""); }}>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>
            Exam / assessment
            <select value={examChoice} onChange={(e) => setExamChoice(e.target.value)}>
              {grid?.exams.map((x) => <option key={x} value={x}>{x}{grid.types?.[x] ? ` · ${ASSESSMENT_TYPES[grid.types[x]]}` : ""}</option>)}
              {!readOnly && <option value={NEW}>+ New exam…</option>}
            </select>
          </label>
          {examChoice === NEW && (
            <label>
              New exam name
              <input value={newExam} onChange={(e) => setNewExam(e.target.value)} placeholder="e.g. Maths CAT 2, Term 1 End-term" />
            </label>
          )}
        </div>
        {(exam || examChoice === NEW) && (
          <div className="grid grid-3">
            <label>
              Type
              <select id="assessment-type" value={type} disabled={readOnly} onChange={(e) => { setType(e.target.value as AssessmentType); setDirty(true); }}>
                {Object.entries(ASSESSMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>
              Marked out of
              <input id="marked-out-of" value={outOf} disabled={readOnly} inputMode="numeric" placeholder="Optional, e.g. 20 (blank = levels)" onChange={(e) => { setOutOf(e.target.value.replace(/[^\d.]/g, "")); setDirty(true); }} />
            </label>
          </div>
        )}
        <div className="small muted">
          {marks
            ? `Type each learner's marks out of ${marks}; the CBC level is worked out for you (EE1 90%+, EE2 75%+, ME1 58%+, ME2 41%+, AE1 31%+, AE2 21%+, BE1 11%+, BE2 below). You can also type a level.`
            : `Levels: ${Object.entries(LEVEL_NAMES).map(([k, v]) => `${k} = ${v}`).join(" · ")}. Sub-levels (EE1, EE2…) are also accepted. For quizzes and tests scored in marks, fill in "Marked out of".`}
        </div>
      </div>

      <div className="card stack">
        {students.length === 0 ? (
          <p className="muted">This class has no learners yet. Add them in School Admin or import a class list.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Learner</th>
                  {areas.map((a) => <th key={a}>{a}</th>)}
                  <th>Comment</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{s.name}</td>
                    {areas.map((a) => (
                      <td key={a}>
                        {readOnly ? (
                          <span>{s.levels[a] ? (marks && /^[\d.]+$/.test(s.levels[a]) ? `${s.levels[a]}/${marks} · ${levelFromPercent((Number(s.levels[a]) / marks) * 100)}` : s.levels[a]) : "—"}</span>
                        ) : marks ? (
                          <MarksCell value={s.levels[a] ?? ""} outOf={marks} label={`${s.name} ${a}`} onChange={(v) => setLevel(s.id, a, v)} />
                        ) : (
                        <select value={s.levels[a] ?? ""} onChange={(e) => setLevel(s.id, a, e.target.value)} aria-label={`${s.name} ${a}`}>
                          <option value="">—</option>
                          {LEVEL_OPTIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                        </select>
                        )}
                      </td>
                    ))}
                    <td>
                      {readOnly ? (
                        <span className="small">{s.comment || "—"}</span>
                      ) : (
                      <input
                        value={s.comment}
                        onChange={(e) => { const v = e.target.value; setStudents((list) => list.map((x) => (x.id === s.id ? { ...x, comment: v } : x))); setDirty(true); }}
                        placeholder="Optional"
                        style={{ minWidth: 180 }}
                        aria-label={`${s.name} comment`}
                      />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!readOnly && (
        <div className="row">
          <input value={newArea} onChange={(e) => setNewArea(e.target.value)} placeholder="Add a learning area, e.g. Agriculture" onKeyDown={(e) => e.key === "Enter" && addArea()} style={{ maxWidth: 280 }} />
          <button type="button" className="secondary" onClick={addArea} disabled={!newArea.trim()}>Add column</button>
          <span style={{ flex: 1 }} />
          <button onClick={save} disabled={busy || students.length === 0}>{busy ? "Saving…" : dirty ? "Save results •" : "Save results"}</button>
        </div>
        )}
        {msg && <div className={msg.ok ? "small" : "error"}>{msg.ok ? "✅ " : ""}{msg.text}</div>}
      </div>

      {!readOnly && (
      <CsvImportCard
        title="Upload results from a spreadsheet"
        description={
          <>
            Columns: <strong>Student name</strong>, <strong>Class</strong>, then one column per learning area holding {marks ? `marks out of ${marks} (or a level)` : "EE / ME / AE / BE"}, and an optional
            <strong> Comment</strong>. Results go into the exam chosen above{exam ? ` (${exam})` : ""}. Uploading again replaces that exam&apos;s results for the
            learners in the file.
          </>
        }
        endpoint="/api/results/import"
        templateName="schoolsync-results-template.csv"
        templateCsv={RESULTS_TEMPLATE_CSV}
        extra={{ exam, type, outOf: marks ? String(marks) : "" }}
        disabledReason={exam ? null : "Choose or name an exam above first."}
      />
      )}
    </div>
  );
}

/** A marks box with the level it works out to underneath. */
function MarksCell({ value, outOf, label, onChange }: { value: string; outOf: number; label: string; onChange: (v: string) => void }) {
  const n = Number(value);
  const isMarks = value.trim() !== "" && /^[\d.]+$/.test(value.trim());
  const hint = isMarks ? (n > outOf ? `over ${outOf}` : levelFromPercent((n / outOf) * 100)) : value.trim() ? value.trim().toUpperCase() : "";
  return (
    <div className="marks-cell">
      <input value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} inputMode="decimal" placeholder={`/${outOf}`} />
      {hint && <span className={`small ${isMarks && n > outOf ? "error-text" : "muted"}`}>{hint}</span>}
    </div>
  );
}
