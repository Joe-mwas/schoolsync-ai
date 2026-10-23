import { HttpError } from "./errors.ts";
import { generateTemporaryPassword } from "./password.ts";
import { ROLE_LABELS } from "./permissions.ts";
import { phoneKey } from "./phone.ts";
import { ROLES, type Database, type PasswordHelpRequest, type Role, type User } from "./types.ts";
import { createPerson, findBySignInName, setPassword } from "./users.ts";

/**
 * "Forgot your password?" on the sign-in page: the person leaves their
 * details, the administrator is told on WhatsApp and their dashboard, and
 * sets a temporary password with one click. The person asking is never told
 * whether the details matched an account.
 */

export interface PasswordHelpInput {
  contact?: unknown;
  role?: unknown;
  name?: unknown;
  note?: unknown;
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const sameContact = (a: string, b: string) => a.toLowerCase() === b.toLowerCase() || (phoneKey(a) !== "" && phoneKey(a) === phoneKey(b));
const KEEP = 300;

/** Save a request. Returns isNew false when the same person already has one open (no second alert). */
export function requestPasswordHelp(db: Database, input: PasswordHelpInput): { request: PasswordHelpRequest; isNew: boolean } {
  const contact = text(input.contact, 120);
  if (!contact) throw new HttpError(400, "Type the email or phone number you sign in with");
  const name = text(input.name, 80);
  if (!name) throw new HttpError(400, "Type your name so the school knows who you are");
  const role = typeof input.role === "string" && (ROLES as readonly string[]).includes(input.role) ? (input.role as Role) : null;
  const user = findBySignInName(db, contact);
  const open = db.passwordHelp.find((r) => r.status === "open" && (user ? r.userId === user.id : sameContact(r.contact, contact)));
  if (open) return { request: open, isNew: false };
  const request: PasswordHelpRequest = {
    id: `pw-${crypto.randomUUID().slice(0, 8)}`,
    contact,
    role,
    name,
    note: text(input.note, 300),
    userId: user?.id ?? null,
    status: "open",
    createdAt: new Date().toISOString(),
    handledAt: null,
    handledBy: null,
  };
  db.passwordHelp.push(request);
  // Keep the list from growing forever: drop the oldest handled requests.
  while (db.passwordHelp.length > KEEP) {
    const i = db.passwordHelp.findIndex((r) => r.status !== "open");
    db.passwordHelp.splice(i === -1 ? 0 : i, 1);
  }
  return { request, isNew: true };
}

/** The account a request matched, described for the administrator. */
export function describeAccount(db: Pick<Database, "users">, r: PasswordHelpRequest): string {
  const u = r.userId ? db.users.find((x) => x.id === r.userId) : undefined;
  if (!u) return "No account matches these details. Check them, then add the person with one click.";
  return `${u.name} (${ROLE_LABELS[u.role]}${u.email ? `, ${u.email}` : ""}${u.phone ? `, ${u.phone}` : ""})`;
}

/** The WhatsApp alert sent to the administrator. */
export function passwordHelpMessage(db: Pick<Database, "users">, r: PasswordHelpRequest, schoolName: string): string {
  return [
    `🔑 Password help request`,
    `Name: ${r.name}`,
    `Signs in with: ${r.contact}`,
    ...(r.role ? [`Role chosen: ${ROLE_LABELS[r.role]}`] : []),
    `Account: ${describeAccount(db, r)}`,
    ...(r.note ? [`Note: ${r.note}`] : []),
    r.userId ? `Open your SchoolSync dashboard and click Reset password to give them a temporary one.` : `Open your SchoolSync dashboard: if they belong to the school, click Add & give password.`,
    `— ${schoolName}`,
  ].join("\n");
}

/** The administrator gives the matched account a temporary password (shown once); they choose their own at sign-in. */
export function resetFromRequest(db: Database, admin: User, id: string): { password: string; user: User } {
  if (admin.role !== "admin") throw new HttpError(403, "Only the administrator handles password requests");
  const r = db.passwordHelp.find((x) => x.id === id);
  if (!r) throw new HttpError(404, "Request not found");
  if (r.status !== "open") throw new HttpError(409, "This request was already handled");
  const user = r.userId ? db.users.find((u) => u.id === r.userId) : undefined;
  if (!user) throw new HttpError(400, "No account matches this request. Dismiss it, or add the person in School Admin.");
  if (user.id === admin.id) throw new HttpError(400, "Change your own password from My account");
  const password = generateTemporaryPassword();
  setPassword(user, password, { mustChange: true });
  Object.assign(r, { status: "reset", handledAt: new Date().toISOString(), handledBy: admin.id });
  return { password, user };
}

export function dismissRequest(db: Database, admin: User, id: string): PasswordHelpRequest {
  if (admin.role !== "admin") throw new HttpError(403, "Only the administrator handles password requests");
  const r = db.passwordHelp.find((x) => x.id === id);
  if (!r) throw new HttpError(404, "Request not found");
  if (r.status !== "open") throw new HttpError(409, "This request was already handled");
  Object.assign(r, { status: "dismissed", handledAt: new Date().toISOString(), handledBy: admin.id });
  return r;
}

export interface AddFromRequestInput {
  role?: unknown;
  classId?: unknown;
  childId?: unknown;
}

/**
 * Someone without an account asked for help: the administrator checks the
 * details, confirms the role (and a class or child), and the account is
 * created from the request with a temporary password (shown once).
 */
export function addFromRequest(db: Database, admin: User, id: string, input: AddFromRequestInput): { password: string; user: User } {
  if (admin.role !== "admin") throw new HttpError(403, "Only the administrator handles password requests");
  const r = db.passwordHelp.find((x) => x.id === id);
  if (!r) throw new HttpError(404, "Request not found");
  if (r.status !== "open") throw new HttpError(409, "This request was already handled");
  if (findBySignInName(db, r.contact)) throw new HttpError(409, "Someone already signs in with these details; use Reset password instead");
  const role = typeof input.role === "string" && (ROLES as readonly string[]).includes(input.role) ? (input.role as Role) : r.role;
  if (!role) throw new HttpError(400, "Choose the person's role");
  // A request from the sign-in page can't create an administrator: that's done deliberately in School Admin.
  if (role === "admin") throw new HttpError(400, "Add administrators in School Admin");
  const byEmail = r.contact.includes("@");
  const classId = typeof input.classId === "string" && input.classId ? input.classId : null;
  const childId = typeof input.childId === "string" && input.childId ? input.childId : null;
  const password = generateTemporaryPassword();
  const user = createPerson(
    db,
    {
      name: r.name,
      role,
      email: byEmail ? r.contact : "",
      phone: byEmail ? "" : r.contact,
      classIds: classId && (role === "teacher" || role === "student") ? [classId] : [],
      childIds: childId && role === "parent" ? [childId] : [],
      password,
    },
    () => `u-${crypto.randomUUID().slice(0, 8)}`,
  );
  Object.assign(r, { status: "added", userId: user.id, handledAt: new Date().toISOString(), handledBy: admin.id });
  return { password, user };
}
