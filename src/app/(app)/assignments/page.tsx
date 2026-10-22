import { assignmentsFor } from "@/lib/assignments";
import { requireUser } from "@/lib/auth";
import { SUGGESTED_AREAS } from "@/lib/cbc";
import { readDb } from "@/lib/db";
import { ASSIGNMENT_SETTERS } from "@/lib/types";
import AssignmentsBoard from "./AssignmentsBoard";

export default async function AssignmentsPage() {
  const me = await requireUser([...ASSIGNMENT_SETTERS, "student"]);
  const db = await readDb();
  const isStudent = me.role === "student";
  const classes = db.classes
    .filter((c) => me.role !== "teacher" || me.classIds.includes(c.id))
    .map((c) => ({ id: c.id, name: c.name, learners: db.users.filter((u) => u.role === "student" && u.classIds.includes(c.id)).length }));
  const names = Object.fromEntries(db.users.filter((u) => u.role !== "student").map((u) => [u.id, u.name]));
  const subjects = [...new Set([...SUGGESTED_AREAS, ...db.results.map((r) => r.area)])];
  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>Assignments &amp; revision</h1>
          <p>
            {isStudent
              ? "Work your teachers have set for your class. Tick each assignment off when you've done it. Stuck? Ask the AI Assistant to explain or quiz you."
              : "Set assignments (with a due date) and revision work for your classes. Learners see them here and tick assignments off."}
          </p>
        </div>
      </div>
      <AssignmentsBoard
        // A learner only learns whether they themselves are done, not who else is.
        items={assignmentsFor(db, me).map((a) => (isStudent ? { ...a, doneBy: a.doneBy.filter((id) => id === me.id) } : a))}
        classes={classes}
        subjects={subjects}
        names={names}
        me={{ id: me.id, role: me.role }}
        today={new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10)}
      />
    </div>
  );
}
