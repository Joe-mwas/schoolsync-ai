import { mutateDb, readDb } from "../db.ts";
import { HttpError } from "../errors.ts";
import { notifyPerson } from "../notify.ts";
import { generateTemporaryPassword } from "../password.ts";
import { assignAndNotify } from "../payments.ts";
import { phoneKey } from "../phone.ts";
import { loginLimiter } from "../rateLimit.ts";
import type { AdminAction, User } from "../types.ts";
import { assertCanManage, setPassword, updatePerson } from "../users.ts";
import { sendWhatsAppText } from "../whatsapp.ts";

export interface ActionOutcome {
  action: AdminAction;
  /** Shown once to the administrator, never stored or given to the AI. */
  temporaryPassword?: string;
}

/** Run an approved proposal with the administrator's own permissions, re-checking everything. */
async function run(a: AdminAction, admin: User): Promise<{ result: string; temporaryPassword?: string }> {
  const input = a.input;
  switch (a.kind) {
    case "update_person": {
      const user = await mutateDb((db) => {
        const target = db.users.find((u) => u.id === input.person_id);
        if (!target) throw new HttpError(404, "That person no longer exists");
        assertCanManage(admin, target);
        return updatePerson(db, target.id, {
          ...(typeof input.name === "string" ? { name: input.name } : {}),
          ...(typeof input.phone === "string" ? { phone: input.phone } : {}),
          ...(typeof input.email === "string" ? { email: input.email } : {}),
          ...(typeof input.admission_no === "string" ? { admissionNo: input.admission_no } : {}),
          ...(typeof input.class_id === "string" ? { classIds: [input.class_id] } : {}),
          ...(Array.isArray(input.child_ids) ? { childIds: input.child_ids } : {}),
        });
      });
      return { result: `Updated ${user.name}.` };
    }
    case "reset_password": {
      const password = generateTemporaryPassword();
      const name = await mutateDb((db) => {
        const target = db.users.find((u) => u.id === input.person_id);
        if (!target) throw new HttpError(404, "That person no longer exists");
        assertCanManage(admin, target);
        setPassword(target, password, { mustChange: true });
        return target.name;
      });
      return { result: `${name} has a new temporary password (shown to the administrator once). They choose their own at next sign-in.`, temporaryPassword: password };
    }
    case "unlock_sign_in": {
      const target = (await readDb()).users.find((u) => u.id === input.person_id);
      if (!target) throw new HttpError(404, "That person no longer exists");
      const cleared = [target.email, phoneKey(target.phone)].filter(Boolean).reduce((n, name) => n + loginLimiter.clearAccount(name), 0);
      return { result: cleared ? `${target.name} can sign in again now.` : `${target.name} wasn't locked out (nothing to clear).` };
    }
    case "match_payment": {
      const p = await assignAndNotify(admin, String(input.payment_id), input.student_id);
      return { result: `Recorded M-Pesa ${p.transId} and sent the receipt.` };
    }
    case "resend_message": {
      const db = await readDb();
      const m = db.whatsappMessages.find((x) => x.id === input.message_id);
      if (!m) throw new HttpError(404, "That message no longer exists");
      const user = m.userId ? db.users.find((u) => u.id === m.userId) : undefined;
      if (user?.phone) {
        const sent = await notifyPerson(user, "Message from the school", m.body, m.purpose ?? null);
        return { result: `Sent again to ${user.name} (+${sent?.phone}): ${sent?.status}${sent?.error ? `, ${sent.error}` : ""}.` };
      }
      const r = await sendWhatsAppText(m.phone, m.body);
      return { result: `Sent again to +${m.phone}: ${r.status}${r.status === "failed" ? `, ${r.error}` : ""}.` };
    }
  }
}

/** Approve or reject a pending proposal. Only pending actions can be decided, once. */
export async function decideAction(id: string, admin: User, approve: boolean): Promise<ActionOutcome> {
  const claimed = await mutateDb((db) => {
    const a = db.adminActions.find((x) => x.id === id);
    if (!a) throw new HttpError(404, "Action not found");
    if (a.status !== "pending") throw new HttpError(409, `This action was already ${a.status}`);
    a.decidedAt = new Date().toISOString();
    a.decidedBy = admin.id;
    if (!approve) {
      a.status = "rejected";
      a.result = "Rejected by the administrator.";
    } else a.status = "approved";
    return { ...a };
  });
  if (!approve) return { action: claimed };

  let outcome: { result: string; temporaryPassword?: string };
  let status: AdminAction["status"] = "approved";
  try {
    outcome = await run(claimed, admin);
  } catch (err) {
    status = "failed";
    outcome = { result: `Couldn't do it: ${err instanceof HttpError ? err.message : "unexpected error"}` };
    if (!(err instanceof HttpError)) console.error("Admin AI action failed", err);
  }
  const action = await mutateDb((db) => {
    const a = db.adminActions.find((x) => x.id === id)!;
    a.status = status;
    a.result = outcome.result;
    return { ...a };
  });
  return { action, ...(outcome.temporaryPassword ? { temporaryPassword: outcome.temporaryPassword } : {}) };
}
