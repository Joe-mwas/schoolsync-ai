import type { Database } from "./types.ts";

/**
 * Bring data saved by older versions up to date. Returns true if anything
 * changed (so the caller saves it). Safe to run on every load.
 */
export function migrateDatabase(db: Database, env: Record<string, string | undefined> = process.env): boolean {
  let changed = false;
  for (const key of ["aiLogs", "results", "resultComments", "fees"] as const) {
    if (!Array.isArray(db[key])) {
      (db as unknown as Record<string, unknown[]>)[key] = [];
      changed = true;
    }
  }
  // Before the administrator role existed, the account created from
  // ADMIN_EMAIL was a director; it becomes the administrator.
  const adminEmail = env.ADMIN_EMAIL?.trim().toLowerCase();
  if (adminEmail && !db.users.some((u) => u.role === "admin")) {
    const owner = db.users.find((u) => u.role === "director" && u.email.toLowerCase() === adminEmail);
    if (owner) {
      owner.role = "admin";
      changed = true;
    }
  }
  return changed;
}
