import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readDb } from "./db.ts";
import { HttpError } from "./errors.ts";
import { createSessionToken, readSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from "./session.ts";
import type { PublicUser, Role, User } from "./types.ts";

export function toPublic(user: User): PublicUser {
  const { passwordHash: _hash, sessionVersion: _version, ...rest } = user;
  return rest;
}

export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const session = readSessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const db = await readDb();
  const user = db.users.find((u) => u.id === session.uid);
  if (!user || (user.sessionVersion ?? 0) !== session.version) return null;
  return user;
}

/** Sign the given user in on this response (also used to refresh after a password change). */
export async function setSessionCookie(user: User): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, createSessionToken(user.id, user.sessionVersion ?? 0), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
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
export async function requireApiUser(roles?: Role[], opts: { allowPendingPasswordChange?: boolean } = {}): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Not signed in");
  if (user.mustChangePassword && !opts.allowPendingPasswordChange) {
    throw new HttpError(403, "Choose a new password before continuing");
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
