import type { Database, SchoolProfile } from "./types.ts";

export const emptyProfile = (): SchoolProfile => ({ name: "", motto: "", website: "", phone: "", email: "", address: "", logo: null, updatedAt: null });

/**
 * Bring data saved by older versions up to date. Returns true if anything
 * changed (so the caller saves it). Safe to run on every load.
 */
export function migrateDatabase(db: Database, env: Record<string, string | undefined> = process.env): boolean {
  let changed = false;
  for (const key of ["aiLogs", "results", "resultComments", "fees", "facts", "mpesaPayments", "adminActions", "featureRequests", "forwardedQuestions", "duties", "assignments", "passwordHelp", "documents"] as const) {
    if (!Array.isArray(db[key])) {
      (db as unknown as Record<string, unknown[]>)[key] = [];
      changed = true;
    }
  }
  if (!db.insights || typeof db.insights !== "object" || Array.isArray(db.insights)) {
    db.insights = {};
    changed = true;
  }
  if (!db.profile || typeof db.profile !== "object") {
    db.profile = emptyProfile();
    changed = true;
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
