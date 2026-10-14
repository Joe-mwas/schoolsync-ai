import assert from "node:assert/strict";
import { test } from "node:test";
import { feeStatement } from "../src/lib/fees.ts";
import { parseReminderOptions, planReminders, reminderText } from "../src/lib/reminders.ts";
import { seedDatabase } from "../src/lib/seed.ts";
import type { Database, FeeEntry } from "../src/lib/types.ts";
import { createPerson } from "../src/lib/users.ts";

const NOW = Date.parse("2026-10-14T08:00:00Z");
const opts = (over: Partial<ReturnType<typeof parseReminderOptions>> = {}) => ({ classId: null, minBalance: 1, skipDays: 7, note: "", ...over });
const charge = (db: Database, studentId: string, amount: number): void => {
  const f: FeeEntry = { id: `f-${studentId}-${amount}`, studentId, term: "Term 3 2026", kind: "charge", amount, date: "2026-10-01", reference: null, note: null, source: "manual", createdBy: null, createdAt: "2026-10-01T00:00:00Z" };
  db.fees.push(f);
};

test("each parent gets one message about the children who owe, with how to pay", () => {
  const db = seedDatabase();
  const brianOwes = feeStatement(db, "u-student1").balance;
  assert.ok(brianOwes > 0, "demo data: Brian owes");
  // A sibling of Brian in another class who also owes.
  const mercy = createPerson(db, { name: "Mercy Kamau", role: "student", classIds: ["c-grade8"], admissionNo: "1003" }, () => "u-mercy", "dry-run");
  db.users.find((u) => u.id === "u-parent1")!.childIds.push(mercy.id);
  charge(db, mercy.id, 4000);

  const plan = planReminders(db, opts(), "Sunrise Academy", "247247", NOW);
  const james = plan.reminders.find((r) => r.parent.id === "u-parent1")!;
  assert.deepEqual(james.children.map((c) => c.name), ["Brian Kamau", "Mercy Kamau"]);
  assert.match(james.text, /^Dear James Kamau,/);
  assert.match(james.text, /Brian Kamau \(Grade 7 East\): Ksh 5,000/);
  assert.match(james.text, /Mercy Kamau \(Grade 8 West\): Ksh 4,000/);
  assert.match(james.text, /Paybill 247247, using each child's account number:\n  Brian Kamau: 1001\n  Mercy Kamau: 1003/);
  assert.equal(plan.reminders.filter((r) => r.parent.id === "u-parent1").length, 1, "one message per parent");
  assert.equal(plan.totalOwed, brianOwes + 4000 + (plan.reminders.find((r) => r.parent.id === "u-parent2")?.children[0].balance ?? 0));
});

test("filters: class, minimum balance, and parents reminded recently", () => {
  const db = seedDatabase();
  charge(db, "u-student2", 2000);
  assert.deepEqual(planReminders(db, opts({ classId: "c-grade8" }), "S", "", NOW).reminders.map((r) => r.parent.id), ["u-parent2"]);
  assert.deepEqual(planReminders(db, opts({ minBalance: 3000 }), "S", "", NOW).reminders.map((r) => r.parent.id), ["u-parent1"]);

  db.whatsappMessages.push({ id: "w1", direction: "outbound", phone: "254700000004", userId: "u-parent1", body: "…", status: "sent", error: null, announcementId: null, createdAt: "2026-10-12T08:00:00Z", purpose: "fee-reminder" });
  const plan = planReminders(db, opts(), "S", "", NOW);
  assert.equal(plan.recentlyReminded, 1);
  assert.deepEqual(plan.reminders.map((r) => r.parent.id), ["u-parent2"]);
  assert.equal(planReminders(db, opts({ skipDays: 0 }), "S", "", NOW).reminders.length, 2, "0 days = remind everyone");
  assert.equal(planReminders(db, opts({ skipDays: 1 }), "S", "", NOW).reminders.length, 2, "reminded 2 days ago is outside a 1-day window");
  // A failed send doesn't count as reminded.
  db.whatsappMessages[db.whatsappMessages.length - 1].status = "failed";
  assert.equal(planReminders(db, opts(), "S", "", NOW).recentlyReminded, 0);
});

test("learners whose parents have no WhatsApp number are listed to call instead", () => {
  const db = seedDatabase();
  db.users.find((u) => u.id === "u-parent1")!.phone = undefined;
  const plan = planReminders(db, opts(), "S", "247247", NOW);
  assert.equal(plan.reminders.some((r) => r.parent.id === "u-parent1"), false);
  assert.deepEqual(plan.unreachable.map((u) => u.name), ["Brian Kamau"]);
});

test("the message reads well without a Paybill and with a note", () => {
  const text = reminderText({ name: "Ann Njeri" }, [{ name: "Faith Njeri", className: "Grade 8 West", balance: 2500, admissionNo: null }], "Sunrise Academy", "Please clear by Friday.", "");
  assert.equal(
    text,
    "Dear Ann Njeri,\nThis is a friendly reminder from Sunrise Academy about school fees. Balance due:\n• Faith Njeri (Grade 8 West): Ksh 2,500\nPlease clear by Friday.\nIf you have already paid, thank you, and please ignore this message. Reply 2 any time to see your balance.",
  );
  assert.match(reminderText({ name: "A" }, [{ name: "B", className: "C", balance: 1, admissionNo: "77" }], "S", "", "247247"), /Paybill 247247, Account 77\./);
});

test("options are checked", () => {
  const db = seedDatabase();
  assert.deepEqual(parseReminderOptions(db, {}), { classId: null, minBalance: 1, skipDays: 7, note: "" });
  assert.deepEqual(parseReminderOptions(db, { classId: "c-grade7", minBalance: "Ksh 1,000", skipDays: "14", note: "  By  Friday " }), { classId: "c-grade7", minBalance: 1000, skipDays: 14, note: "By Friday" });
  assert.throws(() => parseReminderOptions(db, { classId: "nope" }), /Unknown class/);
  assert.throws(() => parseReminderOptions(db, { minBalance: "abc" }), /smallest balance/);
  assert.throws(() => parseReminderOptions(db, { skipDays: "99" }), /0–60/);
  assert.throws(() => parseReminderOptions(db, { note: "x".repeat(301) }), /under 300/);
});
