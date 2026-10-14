import { errorResponse, requireApiUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { parseReminderOptions, type ReminderPlan } from "@/lib/reminders";
import { reminderPlan, startReminders } from "@/lib/sendReminders";
import { OFFICE } from "@/lib/types";

function summary(plan: ReminderPlan) {
  return {
    parents: plan.reminders.length,
    learners: plan.reminders.reduce((n, r) => n + r.children.length, 0),
    totalOwed: plan.totalOwed,
    recentlyReminded: plan.recentlyReminded,
    unreachable: plan.unreachable,
    sample: plan.reminders[0]?.text ?? null,
    recipients: plan.reminders.map((r) => ({ name: r.parent.name, children: r.children.map((c) => c.name).join(", "), owed: r.children.reduce((n, c) => n + c.balance, 0) })),
  };
}

/** POST { action: "preview" | "send", classId, minBalance, skipDays, note } */
export async function POST(req: Request) {
  try {
    await requireApiUser(OFFICE);
    const input = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const opts = parseReminderOptions(await readDb(), input);
    const plan = input.action === "send" ? await startReminders(opts) : await reminderPlan(opts);
    return Response.json({ sending: input.action === "send", ...summary(plan) });
  } catch (err) {
    return errorResponse(err);
  }
}
