import { HttpError } from "./errors.ts";
import type { Database, SchoolProfile } from "./types.ts";

/**
 * The school's own details from onboarding. The name typed in Setup wins over
 * the SCHOOL_NAME setting everywhere the school's name appears (WhatsApp
 * messages, the brief, the sign-in page).
 */

const g = globalThis as typeof globalThis & { __schoolsyncProfileName?: string };

/** Kept in step with the data by db.ts, so schoolName() needs no database read. */
export function rememberProfileName(db: Pick<Database, "profile"> | null): void {
  g.__schoolsyncProfileName = db?.profile?.name?.trim() || "";
}

export function profileName(): string {
  return g.__schoolsyncProfileName ?? "";
}

export interface ProfileInput {
  name?: unknown;
  motto?: unknown;
  website?: unknown;
  phone?: unknown;
  email?: unknown;
  address?: unknown;
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

/** Accept "stthomas.ac.ke" or a full address; only http(s) links are kept. */
export function cleanWebsite(raw: string): string {
  if (!raw) return "";
  const withScheme = /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new HttpError(400, "That website address doesn't look right, e.g. stthomas.ac.ke");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new HttpError(400, "The website must start with http:// or https://");
  if (!url.hostname.includes(".")) throw new HttpError(400, "That website address doesn't look right, e.g. stthomas.ac.ke");
  return url.toString().replace(/\/$/, "");
}

export function updateProfile(db: Database, input: ProfileInput): SchoolProfile {
  const email = text(input.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "That email address doesn't look right");
  const name = text(input.name, 100);
  if (!name) throw new HttpError(400, "Type the school's name");
  db.profile = {
    ...db.profile,
    name,
    motto: text(input.motto, 140),
    website: cleanWebsite(text(input.website, 200)),
    phone: text(input.phone, 40),
    email,
    address: text(input.address, 200),
    updatedAt: new Date().toISOString(),
  };
  return db.profile;
}
