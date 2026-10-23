import { createHmac, timingSafeEqual } from "node:crypto";

/** Signed, stateless session tokens: base64url(payload).signature */

const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
/** However active they are, staff sign in again after this long. */
export const STAFF_MAX_SESSION_SECONDS = 60 * 60 * 12;
const TICKET_SECONDS = 5 * 60;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s !== "change-me") return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production");
  }
  return "schoolsync-dev-secret";
}

function sign(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

function verified(token: string | undefined, prefix: string): Record<string, unknown> | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(prefix + payload));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

export interface Session {
  uid: string;
  /** Must match the user's sessionVersion; bumping it signs out old sessions. */
  version: number;
  /** When this sign-in started (ms); kept when the session is extended. */
  iat: number;
}

/**
 * A session valid for `ttlSeconds` from now (a week by default). Staff
 * sessions get a short ttl that each sign of activity extends, so a
 * forgotten computer signs itself out.
 */
export function createSessionToken(userId: string, version = 0, now = Date.now(), opts: { ttlSeconds?: number; issuedAt?: number } = {}): string {
  const exp = now + (opts.ttlSeconds ?? MAX_AGE_SECONDS) * 1000;
  const payload = Buffer.from(JSON.stringify({ uid: userId, v: version, iat: opts.issuedAt ?? now, exp })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token: string | undefined, now = Date.now()): Session | null {
  const data = verified(token, "");
  if (!data) return null;
  const { uid, v, exp, iat } = data;
  if (typeof uid !== "string" || typeof exp !== "number" || exp < now) return null;
  return { uid, version: typeof v === "number" ? v : 0, iat: typeof iat === "number" ? iat : 0 };
}

/**
 * After the right password, someone with two-step sign-in gets this ticket
 * instead of a session; with a correct code it becomes a session. Signed
 * differently, so a ticket can never pass as a session.
 */
export function createTicket(userId: string, version: number, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ uid: userId, v: version, exp: now + TICKET_SECONDS * 1000 })).toString("base64url");
  return `${payload}.${sign(`ticket:${payload}`)}`;
}

export function readTicket(ticket: string | undefined, now = Date.now()): { uid: string; version: number } | null {
  const data = verified(ticket, "ticket:");
  if (!data) return null;
  const { uid, v, exp } = data;
  if (typeof uid !== "string" || typeof v !== "number" || typeof exp !== "number" || exp < now) return null;
  return { uid, version: v };
}

export const SESSION_COOKIE = "schoolsync_session";
export const SESSION_MAX_AGE = MAX_AGE_SECONDS;
