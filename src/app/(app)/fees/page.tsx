import { requireUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { currencyLabel, feeStatement } from "@/lib/fees";
import { OFFICE } from "@/lib/types";
import { darajaConfig, mpesaReceiving } from "@/lib/daraja";
import FeesManager from "./FeesManager";
import MpesaCard from "./MpesaCard";

export default async function FeesPage() {
  await requireUser(OFFICE);
  const db = await readDb();
  const classes = new Map(db.classes.map((c) => [c.id, c.name]));
  const learners = db.users
    .filter((u) => u.role === "student")
    .map((u) => {
      const st = feeStatement(db, u.id);
      return { id: u.id, name: u.name, admissionNo: u.admissionNo ?? null, classId: u.classIds[0] ?? null, className: classes.get(u.classIds[0] ?? "") ?? "—", charged: st.charged, paid: st.paid, balance: st.balance };
    })
    .sort((a, b) => a.className.localeCompare(b.className) || a.name.localeCompare(b.name));
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
      <MpesaCard
        status={mpesaReceiving() ? (darajaConfig().sandbox ? "sandbox" : "live") : "off"}
        paybill={darajaConfig().shortCode}
        currency={currencyLabel()}
        learners={learners.map((l) => ({ id: l.id, label: `${l.name}${l.admissionNo ? ` (${l.admissionNo})` : ""} — ${l.className}` }))}
        names={Object.fromEntries(learners.map((l) => [l.id, l.name]))}
        payments={[...db.mpesaPayments].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)).filter((p, i) => p.status === "unmatched" || i < 50)}
      />
      <FeesManager learners={learners} classes={db.classes.map((c) => ({ id: c.id, name: c.name }))} currency={currencyLabel()} defaultTerm={defaultTerm} />
    </div>
  );
}
