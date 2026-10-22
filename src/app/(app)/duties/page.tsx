import { requireUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { dutiesFor } from "@/lib/duties";
import { DUTY_MANAGERS, DUTY_VIEWERS } from "@/lib/types";
import DutiesManager from "./DutiesManager";

export default async function DutiesPage() {
  const me = await requireUser([...DUTY_VIEWERS, "teacher"]);
  const db = await readDb();
  const canAssign = DUTY_MANAGERS.includes(me.role);
  const names = Object.fromEntries(db.users.map((u) => [u.id, u.name]));
  const classes = new Map(db.classes.map((c) => [c.id, c.name]));
  const teachers = db.users
    .filter((u) => u.role === "teacher")
    .map((t) => ({ id: t.id, name: t.name, classes: t.classIds.map((id) => classes.get(id)).filter(Boolean).join(", "), hasWhatsApp: Boolean(t.phone) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>Duties</h1>
          <p>
            {me.role === "director"
              ? "Every duty the headteacher has given teachers, and whether it's done."
              : canAssign
              ? "Give teachers duties (duty teacher, games, exams, clubs, trips…). Each teacher gets it on WhatsApp and marks it done here."
              : "Duties the headteacher has given you. Mark each one done when it's finished."}
          </p>
        </div>
      </div>
      <DutiesManager duties={dutiesFor(db, me)} teachers={teachers} names={names} canAssign={canAssign} myId={me.id} />
    </div>
  );
}
