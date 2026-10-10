import { HttpError } from "./errors.ts";
import { hashPassword } from "./password.ts";
import { canonicalPhone, phoneKey } from "./phone.ts";
import { ROLES, type Database, type Role, type User } from "./types.ts";

export const MIN_PASSWORD_LENGTH = 8;

export function validateNewPassword(password: unknown): string {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (password.length > 200) throw new HttpError(400, "Password is too long");
  return password;
}

/** Set a password and sign out the user's other sessions. */
export function setPassword(user: User, password: string, opts: { mustChange: boolean }): void {
  user.passwordHash = hashPassword(validateNewPassword(password));
  user.mustChangePassword = opts.mustChange;
  user.sessionVersion = (user.sessionVersion ?? 0) + 1;
}

/** Staff sign in with email; parents and students may use a phone number instead. */
const EMAIL_REQUIRED: Role[] = ["director", "teacher"];

function normalizeEmail(email: unknown, role: Role): string {
  const e = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!e && !EMAIL_REQUIRED.includes(role)) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new HttpError(400, "Enter a valid email address");
  return e;
}

function normalizePhone(phone: unknown): string | undefined {
  if (phone === undefined || phone === null) return undefined;
  if (typeof phone !== "string") throw new HttpError(400, "Invalid phone number");
  if (!phone.trim()) return undefined;
  const canonical = canonicalPhone(phone);
  if (!canonical) throw new HttpError(400, "Phone numbers should look like +254700000000");
  return canonical;
}

function checkEmailFree(db: Database, email: string, exceptId?: string) {
  if (email && db.users.some((u) => u.id !== exceptId && u.email.toLowerCase() === email)) {
    throw new HttpError(409, "Email already in use");
  }
}

/** Phones double as sign-in names, so they must be unique. */
function checkPhoneFree(db: Database, phone: string | undefined, exceptId?: string) {
  const key = phoneKey(phone);
  if (key && db.users.some((u) => u.id !== exceptId && phoneKey(u.phone) === key)) {
    throw new HttpError(409, "Phone number already in use by another person");
  }
}

function checkCanSignIn(role: Role, email: string, phone: string | undefined) {
  if (role === "parent" && !email && !phone) throw new HttpError(400, "Parents need an email or a phone number to sign in");
}

/** Find the account for a sign-in name (email or phone number). */
export function findBySignInName(db: Database, identifier: string): User | undefined {
  const id = identifier.trim().toLowerCase();
  if (!id) return undefined;
  if (id.includes("@")) return db.users.find((u) => u.email && u.email.toLowerCase() === id);
  const key = phoneKey(id);
  return key ? db.users.find((u) => phoneKey(u.phone) === key) : undefined;
}

/** Validate class/children links for a role. */
function checkLinks(db: Database, role: Role, classIds: string[], childIds: string[]) {
  for (const id of classIds) {
    if (!db.classes.some((c) => c.id === id)) throw new HttpError(400, "Unknown class");
  }
  for (const id of childIds) {
    if (!db.users.some((u) => u.id === id && u.role === "student")) throw new HttpError(400, "Unknown student");
  }
  if (classIds.length && role !== "teacher" && role !== "student") throw new HttpError(400, "Only teachers and students belong to classes");
  if (role === "student" && classIds.length > 1) throw new HttpError(400, "A student belongs to one class");
  if (childIds.length && role !== "parent") throw new HttpError(400, "Only parents have children linked");
}

/** Keep each class's teacher in step with teachers' class lists. */
function syncClassTeachers(db: Database, teacher: User) {
  for (const c of db.classes) {
    if (teacher.classIds.includes(c.id)) {
      if (!c.teacherId) c.teacherId = teacher.id;
    } else if (c.teacherId === teacher.id) {
      c.teacherId = db.users.find((u) => u.id !== teacher.id && u.role === "teacher" && u.classIds.includes(c.id))?.id ?? null;
    }
  }
}

const uniq = (ids: unknown): string[] => (Array.isArray(ids) ? [...new Set(ids.filter((x): x is string => typeof x === "string" && x !== ""))] : []);

export interface PersonInput {
  name?: unknown;
  email?: unknown;
  role?: unknown;
  phone?: unknown;
  password?: unknown;
  classIds?: unknown;
  childIds?: unknown;
}

/**
 * A precomputed temporary password (bulk import hashes them in parallel up
 * front), or "dry-run" to skip hashing when previewing.
 */
export type Credentials = { password: string; hash: string } | "dry-run";

export function createPerson(db: Database, input: PersonInput, newId: () => string, credentials?: Credentials): User {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) throw new HttpError(400, "Name is required");
  if (!(ROLES as readonly string[]).includes(String(input.role))) throw new HttpError(400, "Invalid role");
  const role = input.role as Role;
  const email = normalizeEmail(input.email, role);
  checkEmailFree(db, email);
  const phone = normalizePhone(input.phone);
  checkPhoneFree(db, phone);
  checkCanSignIn(role, email, phone);
  const classIds = uniq(input.classIds);
  const childIds = uniq(input.childIds);
  checkLinks(db, role, classIds, childIds);

  const user: User = {
    id: newId(),
    name,
    email,
    role,
    passwordHash: "",
    phone,
    classIds,
    childIds,
  };
  // The director picks a temporary password; the person must replace it.
  if (credentials === "dry-run") {
    user.mustChangePassword = true;
  } else if (credentials) {
    validateNewPassword(credentials.password);
    user.passwordHash = credentials.hash;
    user.mustChangePassword = true;
  } else {
    setPassword(user, String(input.password ?? ""), { mustChange: true });
  }
  user.sessionVersion = 0;
  db.users.push(user);
  if (role === "teacher") syncClassTeachers(db, user);
  return user;
}

export function updatePerson(db: Database, id: string, input: PersonInput): User {
  const user = db.users.find((u) => u.id === id);
  if (!user) throw new HttpError(404, "Person not found");

  if (input.name !== undefined) {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) throw new HttpError(400, "Name is required");
    user.name = name;
  }
  if (input.email !== undefined) {
    const email = normalizeEmail(input.email, user.role);
    checkEmailFree(db, email, id);
    user.email = email;
  }
  if (input.phone !== undefined) {
    const phone = normalizePhone(input.phone);
    checkPhoneFree(db, phone, id);
    user.phone = phone;
  }
  checkCanSignIn(user.role, user.email, user.phone);

  const classIds = input.classIds !== undefined ? uniq(input.classIds) : user.classIds;
  const childIds = input.childIds !== undefined ? uniq(input.childIds) : user.childIds;
  checkLinks(db, user.role, classIds, childIds);
  user.classIds = classIds;
  user.childIds = childIds;
  if (user.role === "teacher") syncClassTeachers(db, user);
  return user;
}

export function deletePerson(db: Database, actorId: string, id: string): void {
  const user = db.users.find((u) => u.id === id);
  if (!user) throw new HttpError(404, "Person not found");
  if (id === actorId) throw new HttpError(400, "You can't remove your own account");
  if (user.role === "director" && db.users.filter((u) => u.role === "director").length <= 1) {
    throw new HttpError(400, "The school needs at least one director");
  }
  db.users = db.users.filter((u) => u.id !== id);
  for (const u of db.users) u.childIds = u.childIds.filter((c) => c !== id);
  if (user.role === "teacher") {
    user.classIds = [];
    syncClassTeachers(db, user);
  }
}
