import Link from "next/link";
import CountUp from "@/components/CountUp";
import InsightsCard from "@/components/InsightsCard";
import { insightFacts, insightScope, insightsFresh } from "@/lib/insights";
import AnnouncementCard, { formatDate } from "@/components/AnnouncementCard";
import { aiConfigured } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { ROLE_LABELS, userClassIds, visibleAnnouncements } from "@/lib/permissions";
import type { Database, User } from "@/lib/types";
import { whatsappConfigured } from "@/lib/whatsapp";
import BriefCard from "@/components/BriefCard";
import { describeLevel } from "@/lib/cbc";
import { currencyLabel, feeStatement, formatMoney, schoolFees } from "@/lib/fees";
import DashboardCharts from "@/components/charts/DashboardCharts";
import { classLevels, feesByClass, monthlyCollections, performanceTrend } from "@/lib/charts";
import { studentReport } from "@/lib/results";
import { dutiesFor, dutyWhen } from "@/lib/duties";
import { assignmentsFor } from "@/lib/assignments";
import PasswordHelpCard from "@/components/PasswordHelpCard";
import { describeAccount } from "@/lib/passwordHelp";
import { isSchoolWide } from "@/lib/types";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card stat-tile">
      <div className="stat-label">{label}</div>
      <div className="stat-value"><CountUp value={value} /></div>
    </div>
  );
}

/** "Good morning" by the time in Nairobi, and today's date. */
function greeting(now = new Date()): { hello: string; today: string } {
  const hour = Number(now.toLocaleString("en-GB", { timeZone: "Africa/Nairobi", hour: "2-digit", hour12: false }));
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return { hello, today: now.toLocaleDateString("en-GB", { timeZone: "Africa/Nairobi", weekday: "long", day: "numeric", month: "long" }) };
}

function UpcomingEvents({ db }: { db: Database }) {
  const today = new Date().toISOString().slice(0, 10);
  const events = db.events.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  return (
    <div className="card">
      <h2>Upcoming events</h2>
      {events.length === 0 ? (
        <p className="muted">No upcoming events.</p>
      ) : (
        <ul className="list">
          {events.map((e) => (
            <li key={e.id}>
              <strong>{e.title}</strong> <span className="muted small">· {formatDate(e.date)}</span>
              <div className="small muted">{e.description}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecentAnnouncements({ user, db, limit = 3 }: { user: User; db: Database; limit?: number }) {
  const names = new Map(db.users.map((u) => [u.id, u.name]));
  const classes = new Map(db.classes.map((c) => [c.id, c.name]));
  const list = visibleAnnouncements(user, db).slice(0, limit);
  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>Latest announcements</h2>
        <Link href="/announcements" className="small">View all →</Link>
      </div>
      {list.length === 0 && <p className="muted">Nothing new.</p>}
      {list.map((a) => (
        <AnnouncementCard key={a.id} a={a} authorName={names.get(a.authorId) ?? "Unknown"} className={a.classId ? classes.get(a.classId) ?? null : null} />
      ))}
    </div>
  );
}

function DirectorDashboard({ user, db }: { user: User; db: Database }) {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const count = (role: string) => db.users.filter((u) => u.role === role).length;
  const waWeek = db.whatsappMessages.filter((m) => m.direction === "outbound" && m.createdAt >= weekAgo).length;
  return (
    <>
      {/* Each role's own figures: the director the school at a glance, the headteacher teaching, the secretary the office. */}
      <div className="grid grid-4">
        {user.role !== "secretary" && <Stat label="Teachers" value={count("teacher")} />}
        <Stat label="Students" value={count("student")} />
        {user.role === "headteacher" ? <Stat label="Classes" value={db.classes.length} /> : <Stat label="Parents" value={count("parent")} />}
        {(user.role === "director" || user.role === "secretary") && <Stat label="Fees outstanding" value={formatMoney(schoolFees(db, weekAgo).outstanding)} />}
        {user.role === "headteacher" && <Stat label="Open duties" value={db.duties.filter((d) => d.status === "open").length} />}
        {(user.role === "admin" || user.role === "secretary") && <Stat label="WhatsApp sent (7 days)" value={waWeek} />}
      </div>
      {user.role === "admin" && (
        <PasswordHelpCard
          requests={db.passwordHelp
            .filter((r) => r.status === "open")
            .map((r) => ({ id: r.id, name: r.name, contact: r.contact, role: r.role ? ROLE_LABELS[r.role] : null, note: r.note, account: describeAccount(db, r), matched: Boolean(r.userId && db.users.some((u) => u.id === r.userId)), createdAt: r.createdAt }))}
        />
      )}
      {/* The director (and administrator) see every chart; the headteacher how classes perform; the secretary the money. */}
      <DashboardCharts
        currency={currencyLabel()}
        {...(user.role !== "secretary" ? { trend: performanceTrend(db), levels: classLevels(db) } : {})}
        {...(user.role !== "headteacher" ? { months: monthlyCollections(db), byClass: feesByClass(db) } : {})}
      />
      {(() => {
        const scope = insightScope(user.role);
        const facts = scope ? insightFacts(db, scope) : "";
        if (!scope || !facts) return null;
        const saved = db.insights[scope] ?? null;
        return <InsightsCard initial={saved} stale={!insightsFresh(saved ?? undefined, facts)} aiReady={aiConfigured()} />;
      })()}
      <BriefCard />
      {user.role === "admin" && (
        <Link href="/ai-review?show=unreviewed" className="card row" style={{ justifyContent: "space-between", color: "inherit" }}>
          <span>
            <strong>AI answers waiting for your review</strong>
            <span className="small muted"> · {db.aiLogs.filter((l) => l.flagged).length} flagged as wrong</span>
          </span>
          <span className="stat-value" style={{ fontSize: "1.4rem" }}>{db.aiLogs.filter((l) => !l.reviewedAt).length} →</span>
        </Link>
      )}
      {user.role === "admin" && (!aiConfigured() || !whatsappConfigured()) && (
        <div className="notice">
          {!aiConfigured() && <div>AI assistant is off — set <code>ANTHROPIC_API_KEY</code> to enable it.</div>}
          {!whatsappConfigured() && <div>WhatsApp is in simulation mode — messages are logged, not sent. Set <code>WHATSAPP_TOKEN</code> and <code>WHATSAPP_PHONE_NUMBER_ID</code> to go live.</div>}
          <div style={{ marginTop: 6 }}>
            <Link href="/setup/connections">Open Setup to connect and test →</Link>
          </div>
        </div>
      )}
      <div className="grid grid-2">
        <RecentAnnouncements user={user} db={db} />
        <div className="stack">
          <div className="card">
            <h2>Classes</h2>
            <ul className="list">
              {db.classes.map((c) => (
                <li key={c.id}>
                  <strong>{c.name}</strong>
                  <div className="small muted">
                    Teacher: {db.users.find((u) => u.id === c.teacherId)?.name ?? "Unassigned"} ·{" "}
                    {plural(db.users.filter((u) => u.role === "student" && u.classIds.includes(c.id)).length, "student")}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <UpcomingEvents db={db} />
        </div>
      </div>
    </>
  );
}

function TeacherDashboard({ user, db }: { user: User; db: Database }) {
  const mine = db.announcements.filter((a) => a.authorId === user.id).length;
  const myClasses = db.classes.filter((c) => user.classIds.includes(c.id));
  const students = db.users.filter((u) => u.role === "student" && u.classIds.some((id) => user.classIds.includes(id)));
  return (
    <>
      {(() => {
        const mine = dutiesFor(db, user).filter((d) => d.status === "open");
        return mine.length ? (
          <Link href="/duties" className="card stack" style={{ color: "inherit", gap: 4 }}>
            <strong>📋 My duties ({mine.length})</strong>
            {mine.slice(0, 3).map((d) => <span key={d.id} className="small">{d.title}{dutyWhen(d) ? <span className="muted"> · {dutyWhen(d)}</span> : null}</span>)}
          </Link>
        ) : null;
      })()}
      <div className="grid grid-3">
        <Stat label="My classes" value={myClasses.length} />
        <Stat label="My students" value={students.length} />
        <Stat label="Announcements I've posted" value={mine} />
      </div>
      <div className="grid grid-2">
        <RecentAnnouncements user={user} db={db} />
        <div className="stack">
          {myClasses.map((c) => (
            <div className="card" key={c.id}>
              <h2>{c.name}</h2>
              <ul className="list">
                {students.filter((s) => s.classIds.includes(c.id)).map((s) => {
                  const parents = db.users.filter((p) => p.childIds.includes(s.id));
                  return (
                    <li key={s.id}>
                      {s.name}
                      <div className="small muted">Parent: {parents.map((p) => p.name).join(", ") || "—"}</div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <UpcomingEvents db={db} />
        </div>
      </div>
    </>
  );
}

function LearnerCard({ db, learner, showFees }: { db: Database; learner: User; showFees: boolean }) {
  const report = studentReport(db, learner.id);
  const fees = showFees ? feeStatement(db, learner.id) : null;
  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>{learner.name}</h2>
        {fees && fees.entries.length > 0 && (
          <span className={`badge ${fees.balance > 0 ? "urgent" : "ok"}`}>
            {fees.balance > 0 ? `Fee balance ${formatMoney(fees.balance)}` : fees.balance < 0 ? `Credit ${formatMoney(-fees.balance)}` : "Fees fully paid"}
          </span>
        )}
      </div>
      {report ? (
        <>
          <div className="small muted">Latest results: {report.exam}</div>
          <div className="table-wrap">
            <table>
              <tbody>
                {report.areas.map((a) => (
                  <tr key={a.area}><td>{a.area}</td><td className="small">{describeLevel(a.level)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {report.comment && <div className="small"><strong>Teacher&apos;s comment:</strong> {report.comment}</div>}
        </>
      ) : (
        <p className="small muted">No results published yet.</p>
      )}
      {fees && fees.entries.length > 0 && (
        <div className="small muted">
          Fees: {formatMoney(fees.paid)} paid of {formatMoney(fees.charged)}
          {[...fees.entries].reverse().find((e) => e.kind === "payment") &&
            ` · last payment ${[...fees.entries].reverse().find((e) => e.kind === "payment")!.date}`}
        </div>
      )}
      <div className="small muted">Tip: message the school on WhatsApp and reply 1 for results{showFees ? " or 2 for fees" : ""}.</div>
    </div>
  );
}

function FamilyDashboard({ user, db }: { user: User; db: Database }) {
  const classes = new Map(db.classes.map((c) => [c.id, c]));
  const children = db.users.filter((u) => user.childIds.includes(u.id));
  const urgent = visibleAnnouncements(user, db).filter((a) => a.priority === "urgent").length;
  const classIds = userClassIds(user, db);
  return (
    <>
      <div className="grid grid-3">
        {user.role === "parent" ? (
          <Stat label="Children" value={children.length} />
        ) : (
          <Stat label="My class" value={classIds.map((id) => classes.get(id)?.name).join(", ") || "—"} />
        )}
        <Stat label="Urgent notices" value={urgent} />
        <Stat label="Upcoming events" value={db.events.filter((e) => e.date >= new Date().toISOString().slice(0, 10)).length} />
      </div>
      {user.role === "student" && (() => {
        const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
        const todo = assignmentsFor(db, user).filter((a) => a.kind === "assignment" && !a.doneBy.includes(user.id));
        return (
          <Link href="/assignments" className="card stack" style={{ color: "inherit", gap: 4 }}>
            <strong>📚 Assignments to do ({todo.length})</strong>
            {todo.length === 0 && <span className="small muted">Nothing to do. Well done!</span>}
            {todo.slice(0, 4).map((a) => (
              <span key={a.id} className="small">
                {a.subject}: {a.title} <span className={a.dueDate && a.dueDate <= today ? "" : "muted"}>· {a.dueDate && a.dueDate < today ? "overdue" : a.dueDate === today ? "due today" : `due ${a.dueDate}`}</span>
              </span>
            ))}
          </Link>
        );
      })()}
      {(user.role === "parent" ? children : user.role === "student" ? [user] : []).map((child) => (
        <LearnerCard key={child.id} db={db} learner={child} showFees={user.role === "parent"} />
      ))}
      {user.role === "parent" && children.length > 0 && (
        <div className="card">
          <h2>My children</h2>
          <ul className="list">
            {children.map((c) => (
              <li key={c.id}>
                <strong>{c.name}</strong>
                <div className="small muted">
                  {c.classIds.map((id) => {
                    const cls = classes.get(id);
                    const teacher = db.users.find((u) => u.id === cls?.teacherId);
                    return `${cls?.name ?? id} · Class teacher: ${teacher?.name ?? "—"}`;
                  }).join("; ")}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid grid-2">
        <RecentAnnouncements user={user} db={db} limit={4} />
        <div className="stack">
          <UpcomingEvents db={db} />
          <div className="card">
            <h2>{user.role === "student" ? "Stuck on something?" : "Have a question?"}</h2>
            <p className="muted">{user.role === "student" ? "Ask the AI assistant to explain a topic or quiz you for revision." : "Ask the AI assistant about announcements, events, or deadlines."}</p>
            <Link href="/assistant" className="button">Open assistant</Link>
          </div>
        </div>
      </div>
    </>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const db = await readDb();
  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>{greeting().hello}, {user.name.split(" ")[0]}</h1>
          <p>{greeting().today} · {ROLE_LABELS[user.role]} dashboard</p>
        </div>
      </div>
      {isSchoolWide(user.role) && <DirectorDashboard user={user} db={db} />}
      {user.role === "teacher" && <TeacherDashboard user={user} db={db} />}
      {(user.role === "parent" || user.role === "student") && <FamilyDashboard user={user} db={db} />}
    </div>
  );
}
