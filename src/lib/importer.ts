import { HttpError } from "./errors.ts";
import { phoneKey } from "./phone.ts";
import type { IssuedCredential } from "./importFormat.ts";
import type { Database, SchoolClass, User } from "./types.ts";
import { createPerson, type Credentials } from "./users.ts";

/**
 * Bulk import from a class list: one row per student, with the class and
 * optionally a parent. Parents are matched by phone or email, so siblings
 * share one parent account, and re-importing the same file creates nothing new.
 */

export const MAX_IMPORT_ROWS = 2000;

/** RFC 4180 CSV with the delimiter guessed from the header (Excel may use ; or tabs). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", ";", "\t"].reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ",");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

type Field = "studentName" | "className" | "studentEmail" | "parentName" | "parentPhone" | "parentEmail";

const ALIASES: Record<Field, string[]> = {
  studentName: ["studentname", "student", "name", "learner", "learnername", "pupil", "pupilname"],
  className: ["class", "classname", "grade", "form", "stream", "gradeclass"],
  studentEmail: ["studentemail", "learneremail", "pupilemail"],
  parentName: ["parentname", "parent", "guardian", "guardianname", "parentguardian", "parentguardianname"],
  parentPhone: ["parentphone", "phone", "parentwhatsapp", "whatsapp", "guardianphone", "parentphonenumber", "phonenumber", "mobile", "parentmobile"],
  parentEmail: ["parentemail", "guardianemail", "email"],
};

export function mapColumns(header: string[]): Record<Field, number> {
  const norm = header.map((h) => h.toLowerCase().replace(/[^a-z]/g, ""));
  const map = {} as Record<Field, number>;
  for (const field of Object.keys(ALIASES) as Field[]) {
    map[field] = norm.findIndex((h) => ALIASES[field].includes(h));
  }
  // A lone "email" column means the parent's; don't let it double as the student's.
  if (map.studentEmail === map.parentEmail) map.studentEmail = -1;
  const missing = (["studentName", "className"] as Field[]).filter((f) => map[f] === -1);
  if (missing.length) {
    throw new HttpError(400, `The first row must contain column headings including "Student name" and "Class". Download the template to see the format.`);
  }
  return map;
}

export interface ImportRowResult {
  line: number;
  student: string;
  className: string;
  parent: string;
  parentContact: string;
  /** What happened (or would happen), e.g. "New student", "Linked to existing parent". */
  actions: string[];
  error: string | null;
}

export interface ImportReport {
  rows: ImportRowResult[];
  summary: {
    rows: number;
    newStudents: number;
    newParents: number;
    newClasses: number;
    linkedParents: number;
    unchanged: number;
    errors: number;
  };
  credentials: IssuedCredential[];
}

export interface ImportOptions {
  newId: (prefix: string) => string;
  /** Temporary password + hash for each new account, or "dry-run" for previews. */
  credentials: () => { password: string; hash: string } | "dry-run";
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Apply the CSV to `db` (mutating it). Rows with errors are skipped and
 * reported; the rest are applied. Preview by running this on a copy.
 */
export function runImport(db: Database, csv: string, opts: ImportOptions): ImportReport {
  const table = parseCsv(csv);
  if (table.length < 2) throw new HttpError(400, "The file has no rows below the headings");
  if (table.length - 1 > MAX_IMPORT_ROWS) throw new HttpError(400, `Import at most ${MAX_IMPORT_ROWS} rows at a time`);
  const col = mapColumns(table[0]);
  const cell = (r: string[], f: Field) => (col[f] >= 0 ? (r[col[f]] ?? "").trim() : "");

  const report: ImportReport = {
    rows: [],
    summary: { rows: 0, newStudents: 0, newParents: 0, newClasses: 0, linkedParents: 0, unchanged: 0, errors: 0 },
    credentials: [],
  };
  const parentNotes = new Map<string, IssuedCredential>();
  const createdParents = new Set<string>();

  table.slice(1).forEach((r, i) => {
    const line = i + 2; // spreadsheet row number, counting the heading
    const result: ImportRowResult = {
      line,
      student: cell(r, "studentName"),
      className: cell(r, "className"),
      parent: cell(r, "parentName"),
      parentContact: cell(r, "parentPhone") || cell(r, "parentEmail"),
      actions: [],
      error: null,
    };
    report.rows.push(result);
    report.summary.rows++;


    // A row only adds classes/users and links a parent, so undo is cheap.
    const undo = {
      classes: db.classes.length,
      users: db.users.length,
      created: new Set(createdParents),
      links: new Map<User, string[]>(),
      summary: { ...report.summary },
      credentials: report.credentials.length,
      notes: new Map([...parentNotes].map(([k, v]) => [k, v.note])),
    };
    try {
      importRow(db, r, cell, result, report, parentNotes, createdParents, opts, undo.links);
      if (result.actions.length === 0) {
        result.actions.push("Already up to date");
        report.summary.unchanged++;
      }
    } catch (err) {
      db.classes.length = undo.classes;
      db.users.length = undo.users;
      for (const [parent, childIds] of undo.links) parent.childIds = childIds;
      // Counts and issued passwords from the undone part of the row go too.
      report.summary = { ...undo.summary, errors: undo.summary.errors + 1 };
      report.credentials.length = undo.credentials;
      for (const id of [...createdParents]) if (!undo.created.has(id)) createdParents.delete(id);
      for (const id of [...parentNotes.keys()]) {
        if (!undo.notes.has(id)) parentNotes.delete(id);
        else parentNotes.get(id)!.note = undo.notes.get(id)!;
      }
      result.actions = [];
      result.error = err instanceof HttpError ? err.message : "Unexpected error";
      if (!(err instanceof HttpError)) console.error("import row failed", err);
    }
  });
  return report;
}

function importRow(
  db: Database,
  r: string[],
  cell: (r: string[], f: Field) => string,
  result: ImportRowResult,
  report: ImportReport,
  parentNotes: Map<string, IssuedCredential>,
  createdParents: Set<string>,
  opts: ImportOptions,
  linked: Map<User, string[]>,
) {
  const studentName = cell(r, "studentName");
  const className = cell(r, "className");
  if (!studentName) throw new HttpError(400, "Student name is missing");
  if (!className) throw new HttpError(400, "Class is missing");

  // Class: reuse by name or create.
  let cls: SchoolClass | undefined = db.classes.find((c) => same(c.name, className));
  if (!cls) {
    cls = { id: opts.newId("c"), name: className, teacherId: null };
    db.classes.push(cls);
    result.actions.push(`New class "${className}"`);
    report.summary.newClasses++;
  }

  // Student: reuse by name within the class, so re-imports are harmless.
  let student: User | undefined = db.users.find((u) => u.role === "student" && same(u.name, studentName) && u.classIds.includes(cls!.id));
  if (!student) {
    // Students without an email can't sign in, so they get no password.
    const cred = cell(r, "studentEmail") ? opts.credentials() : "dry-run";
    student = createPerson(
      db,
      { name: studentName, role: "student", email: cell(r, "studentEmail"), classIds: [cls.id] },
      () => opts.newId("u"),
      cred as Credentials,
    );
    result.actions.push("New student");
    report.summary.newStudents++;
    if (student.email && cred !== "dry-run") {
      report.credentials.push({ name: student.name, role: "student", signIn: student.email, temporaryPassword: cred.password, note: cls.name });
    }
  }

  // Parent: optional; matched by phone, then email.
  const parentPhone = cell(r, "parentPhone");
  const parentEmail = cell(r, "parentEmail").toLowerCase();
  const parentName = cell(r, "parentName");
  if (!parentPhone && !parentEmail) {
    if (parentName) throw new HttpError(400, "Parent needs a phone number or email");
    return;
  }
  const key = phoneKey(parentPhone);
  let parent = db.users.find((u) => (key && phoneKey(u.phone) === key) || (parentEmail && u.email === parentEmail));
  if (parent && parent.role !== "parent") {
    throw new HttpError(400, `That phone/email belongs to ${parent.name}, who isn't a parent`);
  }
  if (!parent) {
    const cred = opts.credentials();
    parent = createPerson(
      db,
      { name: parentName || `Parent of ${studentName}`, role: "parent", phone: parentPhone, email: parentEmail, childIds: [student.id] },
      () => opts.newId("u"),
      cred as Credentials,
    );
    createdParents.add(parent.id);
    result.actions.push("New parent");
    report.summary.newParents++;
    if (cred !== "dry-run") {
      const issued: IssuedCredential = {
        name: parent.name,
        role: "parent",
        signIn: parent.phone ?? parent.email,
        temporaryPassword: cred.password,
        note: student.name,
      };
      parentNotes.set(parent.id, issued);
      report.credentials.push(issued);
    }
  } else if (!parent.childIds.includes(student.id)) {
    linked.set(parent, parent.childIds);
    parent.childIds = [...parent.childIds, student.id];
    result.actions.push(`Linked to ${createdParents.has(parent.id) ? "" : "existing "}parent ${parent.name}`);
    report.summary.linkedParents++;
    const issued = parentNotes.get(parent.id);
    if (issued) issued.note += `, ${student.name}`;
  }
}
