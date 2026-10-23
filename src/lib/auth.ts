import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readDb } from "./db.ts";
import { HttpError } from "./errors.ts";
import { createSessionToken, readSessionToken, SESSION_COOKIE, SESSION_MAX_AGE, STAFF_MAX_SESSION_SECONDS, type Session } from "./session.ts";
import { STAFF, type Database, type PublicUser, type Role, type User } from "./types.ts";

export function toPublic(user: User): PublicUser {
  const { passwordHash: _hash, sessionVersion: _version, twoStep: _twoStep, twoStepPending: _pending, ...rest } = user;
  return rest;
}

export const isStaff = (user: Pick<User, "role">) => STAFF.includes(user.role);

/** Staff whose school requires two-step sign-in but who haven't set it up yet. */
export function needsTwoStepSetup(user: User, db: Pick<Database, "security">): boolean {
  return Boolean(db.security?.requireTwoStep && isStaff(user) && !user.twoStep);
}

/** The signed-in user and their session, or null. */
export async function currentSession(now = Date.now()): Promise<{ user: User; session: Session; db: Database } | null> {
  const jar = await cookies();
  const session = readSessionToken(jar.get(SESSION_COOKIE)?.value, now);
  if (!session) return null;
  const db = await readDb();
  const user = db.users.find((u) => u.id === session.uid);
  if (!user || (user.sessionVersion ?? 0) !== session.version) return null;
  if (isStaff(user) && now - session.iat > STAFF_MAX_SESSION_SECONDS * 1000) return null;
  return { user, session, db };
}

export async function getCurrentUser(): Promise<User | null> {
  return (await currentSession())?.user ?? null;
}

/**
 * Sign the given user in on this response (also used to refresh after a
 * password change, and by the activity heartbeat to extend a staff session).
 * Staff sessions last only as long as the school's auto sign-out time.
 */
export async function setSessionCookie(user: User, opts: { issuedAt?: number } = {}): Promise<void> {
  const ttlSeconds = isStaff(user) ? Math.max(5, (await readDb()).security?.idleMinutes ?? 30) * 60 : SESSION_MAX_AGE;
  (await cookies()).set(SESSION_COOKIE, createSessionToken(user.id, user.sessionVersion ?? 0, Date.now(), { ttlSeconds, issuedAt: opts.issuedAt }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // Staff cookies end with the browser, as well as after the idle time.
    ...(isStaff(user) ? {} : { maxAge: SESSION_MAX_AGE }),
  });
}

/** For server components/pages: redirect to login when signed out or not allowed. */
export async function requireUser(roles?: Role[]): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) redirect("/dashboard");
  return user;
}

export { HttpError };

/** For route handlers: throw a 401/403 instead of redirecting. */
export async function requireApiUser(
  roles?: Role[],
  opts: { allowPendingPasswordChange?: boolean; allowPendingTwoStep?: boolean } = {},
): Promise<User> {
  const current = await currentSession();
  if (!current) throw new HttpError(401, "Not signed in");
  const { user, db } = current;
  if (user.mustChangePassword && !opts.allowPendingPasswordChange) {
    throw new HttpError(403, "Choose a new password before continuing");
  }
  if (needsTwoStepSetup(user, db) && !opts.allowPendingTwoStep) {
    throw new HttpError(403, "Set up two-step sign-in before continuing");
  }
  if (roles && !roles.includes(user.role)) throw new HttpError(403, "Not allowed");
  return user;
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  console.error(err);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}
