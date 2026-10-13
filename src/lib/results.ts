import { baseLevel, describeLevel, levelScore, normalizeLevel } from "./cbc.ts";
import { HttpError } from "./errors.ts";
import { parseCsv } from "./importer.ts";
import { isLeader, type Database, type ResultEntry, type User } from "./types.ts";

/** Teachers record results for their own classes; leaders for any class. */
export function canEditResults(user: User, classId: string): boolean {
  return isLeader(user.role) || (user.role === "teacher" && user.classIds.includes(classId));
}

/** The secretary can also see every class's results, without changing them. */
export function canViewResults(user: User, classId: string): boolean {
  return canEditResults(user, classId) || user.role === "secretary";
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Exams with results, newest activity first. */
export function examsFor(db: Pick<Database, "results">, studentIds?: string[]): string[] {
  const latest = new Map<string, string>();
  for (const r of db.results) {
    if (studentIds && !studentIds.includes(r.studentId)) continue;
    if ((latest.get(r.exam) ?? "") < r.updatedAt) latest.set(r.exam, r.updatedAt);
  }
  return [...latest.entries()].sort((a, b) => b[1].localeCompare(a[1])).map(([exam]) => exam);
}

export interface StudentReport {
  exam: string;
  areas: { area: string; level: string }[];
  comment: string | null;
}

/** One learner's results for an exam (default: their most recent). */
export function studentReport(db: Pick<Database, "results" | "resultComments">, studentId: string, exam?: string): StudentReport | null {
  const chosen = exam ?? examsFor(db, [studentId])[0];
  if (!chosen) return null;
  const areas = db.results
    .filter((r) => r.studentId === studentId && r.exam === chosen)
    .sort((a, b) => a.area.localeCompare(b.area))
    .map((r) => ({ area: r.area, level: r.level }));
  if (areas.length === 0) return null;
  const comment = db.resultComments.find((c) => c.studentId === studentId && c.exam === chosen)?.comment ?? null;
  return { exam: chosen, areas, comment };
}

export function formatReport(studentName: string, report: StudentReport | null): string {
  if (!report) return `${studentName}: no results have been published yet.`;
  const lines = report.areas.map((a) => `• ${a.area}: ${describeLevel(a.level)}`);
  return [`📘 ${studentName} — ${report.exam}`, ...lines, report.comment ? `Teacher's comment: ${report.comment}` : ""]
    .filter(Boolean)
    .join("\n");
}

export interface GridRow {
  studentId: string;
  /** area → level; blank removes it. */
  levels: Record<string, string>;
  comment?: string;
}

/**
 * Save a class's results for one exam, replacing those learners' entries for
 * that exam. Every level is validated before anything changes.
 */
export function saveResults(db: Database, actor: User, classId: string, exam: string, rows: GridRow[]): { saved: number } {
  const examName = exam.trim();
  if (!examName) throw new HttpError(400, "Give the exam or assessment a name, e.g. Term 3 2026 End-term");
  if (!db.classes.some((c) => c.id === classId)) throw new HttpError(400, "Unknown class");
  if (!canEditResults(actor, classId)) throw new HttpError(403, "You can only record results for your own classes");

  const now = new Date().toISOString();
  const entries: ResultEntry[] = [];
  const comments: Database["resultComments"] = [];
  const studentIds = new Set<string>();
  for (const row of rows) {
    const student = db.users.find((u) => u.id === row.studentId && u.role === "student" && u.classIds.includes(classId));
    if (!student) throw new HttpError(400, "A learner in the list isn't in this class");
    studentIds.add(student.id);
    for (const [rawArea, rawLevel] of Object.entries(row.levels)) {
      const area = rawArea.trim();
      if (!area || !rawLevel?.trim()) continue;
      const level = normalizeLevel(rawLevel);
      if (!level) throw new HttpError(400, `"${rawLevel}" for ${student.name} (${area}) isn't a CBC level: use EE, ME, AE or BE`);
      entries.push({ id: `r-${crypto.randomUUID().slice(0, 8)}`, studentId: student.id, exam: examName, area, level, updatedAt: now, updatedBy: actor.id });
    }
    const comment = row.comment?.trim().slice(0, 1000);
    if (comment) comments.push({ studentId: student.id, exam: examName, comment, updatedAt: now });
  }

  db.results = db.results.filter((r) => !(r.exam === examName && studentIds.has(r.studentId))).concat(entries);
  db.resultComments = db.resultComments.filter((c) => !(c.exam === examName && studentIds.has(c.studentId))).concat(comments);
  return { saved: entries.length };
}

const COMMENT_HEADERS = ["comment", "comments", "remarks", "teacherscomment", "teachercomment", "teacherremarks"];
const norm = (h: string) => h.toLowerCase().replace(/[^a-z]/g, "");

export interface ResultsImportReport {
  rows: { line: number; student: string; className: string; error: string | null; levels: number }[];
  areas: string[];
  saved: number;
  errors: number;
}

/**
 * Import a results sheet: "Student name", "Class", one column per learning
 * area (holding EE/ME/AE/BE), and an optional "Comment". Rows with problems
 * are skipped and reported; the rest are saved per class.
 */
export function importResults(db: Database, actor: User, csv: string, exam: string): ResultsImportReport {
  const table = parseCsv(csv);
  if (table.length < 2) throw new HttpError(400, "The file has no rows below the headings");
  const header = table[0].map((h) => h.trim());
  const studentCol = header.findIndex((h) => ["studentname", "student", "name", "learner", "learnername"].includes(norm(h)));
  const classCol = header.findIndex((h) => ["class", "classname", "grade", "stream"].includes(norm(h)));
  if (studentCol < 0 || classCol < 0) throw new HttpError(400, 'The first row needs "Student name" and "Class" columns, then one column per learning area');
  const commentCol = header.findIndex((h) => COMMENT_HEADERS.includes(norm(h)));
  const areaCols = header.map((h, i) => ({ h, i })).filter(({ h, i }) => h && i !== studentCol && i !== classCol && i !== commentCol);
  if (areaCols.length === 0) throw new HttpError(400, "Add at least one learning-area column (e.g. Mathematics) after Student name and Class");

  const report: ResultsImportReport = { rows: [], areas: areaCols.map((a) => a.h), saved: 0, errors: 0 };
  const byClass = new Map<string, GridRow[]>();
  table.slice(1).forEach((r, idx) => {
    const name = (r[studentCol] ?? "").trim();
    const className = (r[classCol] ?? "").trim();
    const row = { line: idx + 2, student: name, className, error: null as string | null, levels: 0 };
    report.rows.push(row);
    try {
      const cls = db.classes.find((c) => same(c.name, className));
      if (!cls) throw new HttpError(400, `No class called "${className}"`);
      if (!canEditResults(actor, cls.id)) throw new HttpError(403, "Not your class");
      const student = db.users.find((u) => u.role === "student" && same(u.name, name) && u.classIds.includes(cls.id));
      if (!student) throw new HttpError(400, `No learner called "${name}" in ${cls.name}`);
      const levels: Record<string, string> = {};
      for (const { h, i } of areaCols) {
        const raw = (r[i] ?? "").trim();
        if (!raw) continue;
        if (!normalizeLevel(raw)) throw new HttpError(400, `"${raw}" under ${h} isn't EE, ME, AE or BE`);
        levels[h] = raw;
      }
      row.levels = Object.keys(levels).length;
      const comment = commentCol >= 0 ? (r[commentCol] ?? "").trim() : "";
      // A blank row leaves the learner's existing results alone rather than wiping them.
      if (row.levels === 0 && !comment) return;
      const list = byClass.get(cls.id) ?? [];
      list.push({ studentId: student.id, levels, comment: comment || undefined });
      byClass.set(cls.id, list);
    } catch (err) {
      row.error = err instanceof HttpError ? err.message : "Unexpected error";
      report.errors++;
    }
  });
  for (const [classId, rows] of byClass) report.saved += saveResults(db, actor, classId, exam, rows).saved;
  return report;
}

export interface ClassPerformance {
  classId: string;
  className: string;
  learners: number;
  /** Average on the 1 (BE) to 4 (EE) scale. */
  average: number;
  counts: Record<"EE" | "ME" | "AE" | "BE", number>;
  weakestArea: string | null;
  /** Learners with BE in at least half their areas. */
  needingSupport: string[];
}

/** How each class did in an exam, for the director's brief. */
export function examPerformance(db: Database, exam: string): ClassPerformance[] {
  const out: ClassPerformance[] = [];
  for (const cls of db.classes) {
    const learners = db.users.filter((u) => u.role === "student" && u.classIds.includes(cls.id));
    const rs = db.results.filter((r) => r.exam === exam && learners.some((l) => l.id === r.studentId));
    if (rs.length === 0) continue;
    const counts = { EE: 0, ME: 0, AE: 0, BE: 0 };
    for (const r of rs) counts[baseLevel(r.level)]++;
    const byArea = new Map<string, number[]>();
    for (const r of rs) byArea.set(r.area, [...(byArea.get(r.area) ?? []), levelScore(r.level)]);
    const areaAvg = [...byArea.entries()].map(([a, s]) => ({ a, avg: s.reduce((x, y) => x + y, 0) / s.length }));
    areaAvg.sort((x, y) => x.avg - y.avg);
    const needingSupport = learners
      .filter((l) => {
        const mine = rs.filter((r) => r.studentId === l.id);
        return mine.length > 0 && mine.filter((r) => baseLevel(r.level) === "BE").length * 2 >= mine.length;
      })
      .map((l) => l.name);
    out.push({
      classId: cls.id,
      className: cls.name,
      learners: new Set(rs.map((r) => r.studentId)).size,
      average: Math.round((rs.reduce((s, r) => s + levelScore(r.level), 0) / rs.length) * 100) / 100,
      counts,
      weakestArea: areaAvg[0]?.a ?? null,
      needingSupport,
    });
  }
  return out;
}
