import { HttpError } from "./errors.ts";
import { userClassIds } from "./permissions.ts";
import { ASSIGNMENT_SETTERS, type Assignment, type Database, type User } from "./types.ts";

/** Assignments and revision work: teachers set them for their classes, learners see and tick off their own. */

export interface AssignmentInput {
  kind?: unknown;
  title?: unknown;
  subject?: unknown;
  details?: unknown;
  classIds?: unknown;
  dueDate?: unknown;
  link?: unknown;
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Teachers set work for their own classes; the headteacher and administrator for any class. */
function canSetFor(actor: User, classId: string): boolean {
  if (actor.role === "teacher") return actor.classIds.includes(classId);
  return ASSIGNMENT_SETTERS.includes(actor.role);
}

export function createAssignment(db: Database, actor: User, input: AssignmentInput): Assignment {
  if (!ASSIGNMENT_SETTERS.includes(actor.role)) throw new HttpError(403, "Only teachers set assignments");
  const kind = input.kind === "revision" ? "revision" : "assignment";
  const title = text(input.title, 120);
  if (!title) throw new HttpError(400, kind === "revision" ? "Give the revision a title, e.g. End of term revision" : "Give the assignment a title, e.g. Fractions worksheet");
  const subject = text(input.subject, 60);
  if (!subject) throw new HttpError(400, "Choose the subject");
  const ids = Array.isArray(input.classIds) ? [...new Set(input.classIds.map(String))] : [];
  if (ids.length === 0) throw new HttpError(400, "Choose at least one class");
  for (const id of ids) {
    if (!db.classes.some((c) => c.id === id)) throw new HttpError(400, "That class doesn't exist");
    if (!canSetFor(actor, id)) throw new HttpError(403, "You can only set work for your own classes");
  }
  let dueDate: string | null = null;
  if (kind === "assignment") {
    const d = text(input.dueDate, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d))) throw new HttpError(400, "Choose the due date");
    dueDate = d;
  }
  const link = text(input.link, 500);
  if (link && !/^https?:\/\/\S+$/i.test(link)) throw new HttpError(400, "The link must start with http:// or https://");
  const a: Assignment = {
    id: `as-${crypto.randomUUID().slice(0, 8)}`,
    kind,
    title,
    subject,
    details: text(input.details, 3000),
    classIds: ids,
    dueDate,
    link: link || null,
    createdBy: actor.id,
    createdAt: new Date().toISOString(),
    doneBy: [],
  };
  db.assignments.push(a);
  return a;
}

/** Whoever set it, or the headteacher / administrator. */
export function deleteAssignment(db: Database, actor: User, id: string): void {
  const i = db.assignments.findIndex((a) => a.id === id);
  if (i === -1) throw new HttpError(404, "Assignment not found");
  const a = db.assignments[i];
  if (actor.role !== "admin" && actor.role !== "headteacher" && a.createdBy !== actor.id) throw new HttpError(403, "Only the teacher who set it can remove it");
  db.assignments.splice(i, 1);
}

/** A learner ticks an assignment off (or un-ticks it). */
export function setAssignmentDone(db: Database, actor: User, id: string, done: unknown): Assignment {
  if (actor.role !== "student") throw new HttpError(403, "Only learners mark assignments done");
  const a = assignmentsFor(db, actor).find((x) => x.id === id);
  if (!a) throw new HttpError(404, "Assignment not found");
  if (a.kind !== "assignment") throw new HttpError(400, "Revision work isn't marked done");
  if (typeof done !== "boolean") throw new HttpError(400, "Say whether it's done");
  a.doneBy = done ? [...new Set([...a.doneBy, actor.id])] : a.doneBy.filter((x) => x !== actor.id);
  return a;
}

/**
 * What someone may see: a learner the work set for their class, a teacher
 * the work for their classes (and anything they set), the headteacher and
 * administrator everything. Soonest due first, then newest.
 */
export function assignmentsFor(db: Pick<Database, "assignments" | "users">, user: User): Assignment[] {
  let list: Assignment[];
  if (user.role === "admin" || user.role === "headteacher") list = db.assignments;
  else if (user.role === "teacher") list = db.assignments.filter((a) => a.createdBy === user.id || a.classIds.some((id) => user.classIds.includes(id)));
  else if (user.role === "student") {
    const mine = userClassIds(user, db);
    list = db.assignments.filter((a) => a.classIds.some((id) => mine.includes(id)));
  } else list = [];
  return [...list].sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || b.createdAt.localeCompare(a.createdAt));
}

/** Short lines for the learner's AI study helper: what's due and what to revise. */
export function assignmentsContext(db: Pick<Database, "assignments" | "users">, student: User, today = new Date().toISOString().slice(0, 10)): string {
  return assignmentsFor(db, student)
    .filter((a) => a.kind === "revision" || (!a.doneBy.includes(student.id) && (a.dueDate ?? "") >= today))
    .slice(0, 15)
    .map((a) => `${a.kind === "revision" ? "Revision" : `Assignment due ${a.dueDate}`}: ${a.subject}, ${a.title}${a.details ? ` — ${a.details.slice(0, 400)}` : ""}`)
    .join("\n");
}
