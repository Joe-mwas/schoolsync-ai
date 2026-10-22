import { HttpError } from "./errors.ts";
import { DUTY_MANAGERS, type Database, type Duty, type User } from "./types.ts";

/** Duties the headteacher (or director/administrator) gives teachers, e.g. "Duty teacher this week". */

export interface DutyInput {
  title?: unknown;
  details?: unknown;
  teacherIds?: unknown;
  startDate?: unknown;
  endDate?: unknown;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const date = (v: unknown, label: string): string | null => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !DATE.test(v) || Number.isNaN(Date.parse(v))) throw new HttpError(400, `${label} must be a date`);
  return v;
};

export function createDuty(db: Database, actor: User, input: DutyInput): Duty {
  if (!DUTY_MANAGERS.includes(actor.role)) throw new HttpError(403, "Only the headteacher, director or administrator assigns duties");
  const title = typeof input.title === "string" ? input.title.trim().slice(0, 120) : "";
  if (!title) throw new HttpError(400, "Give the duty a title, e.g. Duty teacher this week");
  const ids = Array.isArray(input.teacherIds) ? [...new Set(input.teacherIds.map(String))] : [];
  if (ids.length === 0) throw new HttpError(400, "Choose at least one teacher");
  for (const id of ids) {
    if (!db.users.some((u) => u.id === id && u.role === "teacher")) throw new HttpError(400, "Duties can only be given to teachers");
  }
  const startDate = date(input.startDate, "Start date");
  const endDate = date(input.endDate, "End date");
  if (startDate && endDate && endDate < startDate) throw new HttpError(400, "The end date is before the start date");
  const duty: Duty = {
    id: `duty-${crypto.randomUUID().slice(0, 8)}`,
    title,
    details: typeof input.details === "string" ? input.details.trim().slice(0, 1000) : "",
    teacherIds: ids,
    startDate,
    endDate,
    status: "open",
    createdBy: actor.id,
    createdAt: new Date().toISOString(),
    doneAt: null,
    doneBy: null,
  };
  db.duties.push(duty);
  return duty;
}

/** Assigned teachers mark their duty done (or reopen it); managers can too. */
export function setDutyStatus(db: Database, actor: User, id: string, status: unknown): Duty {
  const duty = db.duties.find((d) => d.id === id);
  if (!duty) throw new HttpError(404, "Duty not found");
  if (!DUTY_MANAGERS.includes(actor.role) && !duty.teacherIds.includes(actor.id)) throw new HttpError(403, "This duty isn't yours");
  if (status !== "open" && status !== "done") throw new HttpError(400, "Choose open or done");
  duty.status = status;
  duty.doneAt = status === "done" ? new Date().toISOString() : null;
  duty.doneBy = status === "done" ? actor.id : null;
  return duty;
}

export function deleteDuty(db: Database, actor: User, id: string): void {
  if (!DUTY_MANAGERS.includes(actor.role)) throw new HttpError(403, "Only the headteacher, director or administrator removes duties");
  const i = db.duties.findIndex((d) => d.id === id);
  if (i === -1) throw new HttpError(404, "Duty not found");
  db.duties.splice(i, 1);
}

/** What someone may see: managers see every duty, a teacher only their own. */
export function dutiesFor(db: Pick<Database, "duties">, user: Pick<User, "id" | "role">): Duty[] {
  const list = DUTY_MANAGERS.includes(user.role) ? db.duties : db.duties.filter((d) => d.teacherIds.includes(user.id));
  return [...list].sort((a, b) => (a.status === b.status ? (a.startDate ?? a.createdAt).localeCompare(b.startDate ?? b.createdAt) : a.status === "open" ? -1 : 1));
}

export function dutyWhen(d: Pick<Duty, "startDate" | "endDate">): string {
  if (d.startDate && d.endDate) return d.startDate === d.endDate ? d.startDate : `${d.startDate} to ${d.endDate}`;
  if (d.startDate) return `from ${d.startDate}`;
  if (d.endDate) return `by ${d.endDate}`;
  return "";
}

/** The WhatsApp message a teacher gets when given a duty. */
export function dutyMessage(d: Duty, teacher: Pick<User, "name">, from: Pick<User, "name">, schoolName: string): string {
  const when = dutyWhen(d);
  return [
    `📋 New duty for ${teacher.name.split(" ")[0]}`,
    `*${d.title}*${when ? ` (${when})` : ""}`,
    ...(d.details ? [d.details] : []),
    `From ${from.name}. See Duties on the school site to mark it done.`,
    `— ${schoolName}`,
  ].join("\n");
}
