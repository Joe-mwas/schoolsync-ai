import { schoolName } from "./ai.ts";
import { darajaConfig } from "./daraja.ts";
import { readDb } from "./db.ts";
import { HttpError } from "./errors.ts";
import { notifyPerson } from "./notify.ts";
import { planReminders, type ReminderOptions, type ReminderPlan } from "./reminders.ts";

let sending = false;

export async function reminderPlan(opts: ReminderOptions): Promise<ReminderPlan> {
  return planReminders(await readDb(), opts, schoolName(), darajaConfig().shortCode);
}

/**
 * Start sending (a few at a time, in the background) and return the plan.
 * Each message is logged on the WhatsApp page as it goes.
 */
export async function startReminders(opts: ReminderOptions): Promise<ReminderPlan> {
  if (sending) throw new HttpError(409, "Reminders are already being sent. Check the WhatsApp page for progress.");
  const plan = await reminderPlan(opts);
  if (plan.reminders.length === 0) return plan;
  sending = true;
  const queue = [...plan.reminders];
  const worker = async () => {
    for (let r = queue.shift(); r; r = queue.shift()) {
      await notifyPerson(r.parent, "Fee reminder", r.text, "fee-reminder").catch((err) => console.error("Fee reminder failed", err));
    }
  };
  void Promise.all([worker(), worker(), worker(), worker()]).finally(() => {
    sending = false;
    console.log(`Fee reminders: ${plan.reminders.length} sent or attempted`);
  });
  return plan;
}
