import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readDb } from "./db.ts";
import { readSessionToken, SESSION_COOKIE } from "./session.ts";
import type { PublicUser, Role, User } from "./types.ts";

export function toPublic(user: User): PublicUser {
  const { passwordHash: _omit, ...rest } = user;
  return rest;
}

export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const uid = readSessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!uid) return null;
  const db = await readDb();
  return db.users.find((u) => u.id === uid) ?? null;
}

/** For server components/pages: redirect to login when signed out or not allowed. */
export async function requireUser(roles?: Role[]): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) redirect("/dashboard");
  return user;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** For route handlers: throw a 401/403 instead of redirecting. */
export async function requireApiUser(roles?: Role[]): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Not signed in");
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
