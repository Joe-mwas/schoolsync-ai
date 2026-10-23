import { createHash, randomUUID } from "node:crypto";
import { hashPassword } from "./password.ts";
import { IDLE_CHOICES, type AiBudget, type Database, type SchoolProfile, type SecuritySettings } from "./types.ts";

export const emptyProfile = (): SchoolProfile => ({ name: "", motto: "", website: "", phone: "", email: "", address: "", logo: null, updatedAt: null });

export const defaultAiBudget = (): AiBudget => ({ monthlyLimitKsh: null, off: false, months: {}, alerts: { month: "", warned: false, reached: false }, creditsOutAt: null });

export const defaultSecurity = (): SecuritySettings => ({ requireTwoStep: false, idleMinutes: 30 });

/**
 * Bring data saved by older versions up to date. Returns true if anything
 * changed (so the caller saves it). Safe to run on every load.
 */
export function migrateDatabase(db: Database, env: Record<string, string | undefined> = process.env): boolean {
  let changed = false;
  for (const key of ["aiLogs", "results", "resultComments", "fees", "facts", "mpesaPayments", "adminActions", "featureRequests", "forwardedQuestions", "duties", "assignments", "passwordHelp", "documents", "activity", "exams"] as const) {
    if (!Array.isArray(db[key])) {
      (db as unknown as Record<string, unknown[]>)[key] = [];
      changed = true;
    }
  }
  if (!db.aiSettings || !["economy", "balanced", "top"].includes(db.aiSettings.familyModel)) {
    db.aiSettings = { familyModel: "economy" };
    changed = true;
  }
  if (!db.security || typeof db.security !== "object") {
    db.security = defaultSecurity();
    changed = true;
  } else if (!(IDLE_CHOICES as readonly number[]).includes(db.security.idleMinutes) || typeof db.security.requireTwoStep !== "boolean") {
    db.security = { requireTwoStep: db.security.requireTwoStep === true, idleMinutes: (IDLE_CHOICES as readonly number[]).includes(db.security.idleMinutes) ? db.security.idleMinutes : 30 };
    changed = true;
  }
  if (!db.aiBudget || typeof db.aiBudget !== "object" || typeof db.aiBudget.months !== "object") {
    db.aiBudget = defaultAiBudget();
    changed = true;
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
  if (applyAdminReset(db, env)) changed = true;
  return changed;
}

/**
 * Emergency sign-in for a locked-out administrator. Setting
 * ADMIN_RESET_PASSWORD (8+ characters) in the hosting settings resets the
 * administrator named by ADMIN_EMAIL (or the only administrator) to that
 * password on the next start: they must choose a new one when they sign in,
 * two-step sign-in is turned off, and other sessions end. Each value works
 * once; remove the setting afterwards. Only someone with access to the
 * hosting account can do this.
 */
export function applyAdminReset(db: Database, env: Record<string, string | undefined>): boolean {
  const password = env.ADMIN_RESET_PASSWORD;
  if (!password || password.length < 8) return false;
  const email = env.ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  const mark = createHash("sha256").update(`${email}\n${password}`).digest("hex");
  if (db.adminResetMark === mark) return false;
  const admins = db.users.filter((u) => u.role === "admin");
  const target = admins.find((u) => email && u.email.toLowerCase() === email) ?? (admins.length === 1 ? admins[0] : undefined);
  if (!target) {
    console.error("ADMIN_RESET_PASSWORD is set, but no administrator matches ADMIN_EMAIL; nothing was reset.");
    return false;
  }
  target.passwordHash = hashPassword(password);
  target.mustChangePassword = true;
  target.twoStep = null;
  target.twoStepPending = null;
  target.sessionVersion = (target.sessionVersion ?? 0) + 1;
  db.adminResetMark = mark;
  if (!Array.isArray(db.activity)) db.activity = [];
  db.activity.push({
    id: `act-${randomUUID().slice(0, 8)}`,
    at: new Date().toISOString(),
    userId: target.id,
    name: target.name,
    role: "admin",
    kind: "security",
    action: "Emergency password reset",
    detail: "From ADMIN_RESET_PASSWORD in the hosting settings; two-step sign-in turned off",
  });
  console.log(`Emergency reset applied for the administrator ${target.email}. Remove ADMIN_RESET_PASSWORD from the hosting settings.`);
  return true;
}
