import { HttpError } from "./errors.ts";
import { feeStatement, formatMoney, parseAmount } from "./fees.ts";
import type { Database, User } from "./types.ts";

/**
 * Fee reminders: one WhatsApp message per parent, listing each of their
 * children who owe, with how to pay. Pure, so the plan can be previewed.
 */

export interface ReminderOptions {
  /** One class, or every class when null. */
  classId: string | null;
  /** Only learners owing at least this much. */
  minBalance: number;
  /** Skip parents reminded within this many days (0 = never skip). */
  skipDays: number;
  /** An extra line from the school, e.g. a deadline. */
  note: string;
}

export interface ReminderChild {
  name: string;
  className: string;
  balance: number;
  admissionNo: string | null;
}

export interface PlannedReminder {
  parent: User;
  children: ReminderChild[];
  text: string;
}

export interface ReminderPlan {
  reminders: PlannedReminder[];
  /** Learners owing whose parents can't be reached on WhatsApp. */
  unreachable: { name: string; className: string; balance: number }[];
  /** Parents left out because they were reminded recently. */
  recentlyReminded: number;
  totalOwed: number;
}

export const MAX_NOTE = 300;

export function parseReminderOptions(db: Pick<Database, "classes">, input: Record<string, unknown>): ReminderOptions {
  const classId = typeof input.classId === "string" && input.classId ? input.classId : null;
  if (classId && !db.classes.some((c) => c.id === classId)) throw new HttpError(400, "Unknown class");
  const minBalance = input.minBalance === undefined || input.minBalance === "" ? 1 : parseAmount(input.minBalance);
  if (minBalance === null) throw new HttpError(400, "Enter the smallest balance to remind about, e.g. 1000");
  const skipDays = Number(input.skipDays ?? 7);
  if (!Number.isInteger(skipDays) || skipDays < 0 || skipDays > 60) throw new HttpError(400, "Choose how many days to wait between reminders (0–60)");
  const note = typeof input.note === "string" ? input.note.trim().replace(/\s+/g, " ") : "";
  if (note.length > MAX_NOTE) throw new HttpError(400, `Keep the extra note under ${MAX_NOTE} characters`);
  return { classId, minBalance: Math.max(1, minBalance), skipDays, note };
}

export function reminderText(parent: Pick<User, "name">, children: ReminderChild[], schoolName: string, note: string, paybill: string): string {
  const lines = children.map((c) => `• ${c.name} (${c.className}): ${formatMoney(c.balance)}`);
  const pay = paybill
    ? children.length === 1
      ? children[0].admissionNo
        ? [`Pay via M-Pesa Paybill ${paybill}, Account ${children[0].admissionNo}.`]
        : [`Pay via M-Pesa Paybill ${paybill}.`]
      : [`Pay via M-Pesa Paybill ${paybill}, using each child's account number:`, ...children.map((c) => `  ${c.name}: ${c.admissionNo ?? "ask the school office"}`)]
    : [];
  return [
    `Dear ${parent.name},`,
    `This is a friendly reminder from ${schoolName} about school fees. Balance due:`,
    ...lines,
    ...pay,
    ...(note ? [note] : []),
    `If you have already paid, thank you, and please ignore this message. Reply 2 any time to see your balance.`,
  ].join("\n");
}

export function planReminders(
  db: Pick<Database, "users" | "classes" | "fees" | "whatsappMessages">,
  opts: ReminderOptions,
  schoolName: string,
  paybill: string,
  now = Date.now(),
): ReminderPlan {
  const classNames = new Map(db.classes.map((c) => [c.id, c.name]));
  const owing = new Map<string, ReminderChild>();
  for (const s of db.users) {
    if (s.role !== "student") continue;
    if (opts.classId && !s.classIds.includes(opts.classId)) continue;
    const balance = feeStatement(db, s.id).balance;
    if (balance < opts.minBalance) continue;
    owing.set(s.id, { name: s.name, className: classNames.get(s.classIds[0] ?? "") ?? "—", balance, admissionNo: s.admissionNo ?? null });
  }

  const since = new Date(now - opts.skipDays * 86_400_000).toISOString();
  const recent = new Set(
    opts.skipDays > 0
      ? db.whatsappMessages.filter((m) => m.purpose === "fee-reminder" && m.status !== "failed" && m.createdAt >= since).map((m) => m.userId)
      : [],
  );

  const reached = new Set<string>();
  const reminders: PlannedReminder[] = [];
  let recentlyReminded = 0;
  for (const parent of db.users) {
    if (parent.role !== "parent") continue;
    const kidIds = parent.childIds.filter((id) => owing.has(id));
    if (kidIds.length === 0 || !parent.phone) continue;
    kidIds.forEach((id) => reached.add(id));
    if (recent.has(parent.id)) {
      recentlyReminded++;
      continue;
    }
    const children = kidIds.map((id) => owing.get(id)!).sort((a, b) => a.name.localeCompare(b.name));
    reminders.push({ parent, children, text: reminderText(parent, children, schoolName, opts.note, paybill) });
  }

  const unreachable = [...owing.entries()].filter(([id]) => !reached.has(id)).map(([, c]) => ({ name: c.name, className: c.className, balance: c.balance }));
  const totalOwed = [...owing.values()].reduce((sum, c) => sum + c.balance, 0);
  return { reminders, unreachable, recentlyReminded, totalOwed };
}
