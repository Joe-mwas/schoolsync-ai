import { requireUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { currencyLabel, feeStatement } from "@/lib/fees";
import { FEE_VIEWERS, isOffice } from "@/lib/types";
import { darajaConfig, mpesaReceiving } from "@/lib/daraja";
import FeesManager from "./FeesManager";
import MpesaCard from "./MpesaCard";
import RemindersCard from "./RemindersCard";

export default async function FeesPage() {
  const me = await requireUser(FEE_VIEWERS);
  const canEdit = isOffice(me.role);
  const db = await readDb();
  const classes = new Map(db.classes.map((c) => [c.id, c.name]));
  const learners = db.users
    .filter((u) => u.role === "student")
    .map((u) => {
      const st = feeStatement(db, u.id);
      return { id: u.id, name: u.name, admissionNo: u.admissionNo ?? null, classId: u.classIds[0] ?? null, className: classes.get(u.classIds[0] ?? "") ?? "—", charged: st.charged, paid: st.paid, balance: st.balance };
    })
    .sort((a, b) => a.className.localeCompare(b.className) || a.name.localeCompare(b.name));
  // The latest batch of reminders (messages sent within an hour of the newest one).
  const reminders = db.whatsappMessages.filter((m) => m.purpose === "fee-reminder").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const lastAt = reminders[0]?.createdAt;
  const last = lastAt ? { at: lastAt, count: new Set(reminders.filter((m) => Date.parse(lastAt) - Date.parse(m.createdAt) < 3_600_000).map((m) => m.userId)).size } : null;
  // Suggest the most recently used term.
  const defaultTerm = [...db.fees].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.term ?? "";
  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>Fees</h1>
          <p>Balances, statements and payments. M-Pesa Paybill payments are recorded automatically. Parents see their balance on WhatsApp (reply 2) and on their dashboard.</p>
        </div>
      </div>
      {!canEdit && <div className="notice small">You can see every balance and statement. Payments and charges are recorded by the director or the secretary.</div>}
      {canEdit && (
      <MpesaCard
        status={mpesaReceiving() ? (darajaConfig().sandbox ? "sandbox" : "live") : "off"}
        paybill={darajaConfig().shortCode}
        currency={currencyLabel()}
        learners={learners.map((l) => ({ id: l.id, label: `${l.name}${l.admissionNo ? ` (${l.admissionNo})` : ""} — ${l.className}` }))}
        names={Object.fromEntries(learners.map((l) => [l.id, l.name]))}
        payments={[...db.mpesaPayments].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)).filter((p, i) => p.status === "unmatched" || i < 50)}
      />
      )}
      {canEdit && <RemindersCard classes={db.classes.map((c) => ({ id: c.id, name: c.name }))} currency={currencyLabel()} last={last} />}
      <FeesManager learners={learners} classes={db.classes.map((c) => ({ id: c.id, name: c.name }))} currency={currencyLabel()} defaultTerm={defaultTerm} readOnly={!canEdit} />
    </div>
  );
}
