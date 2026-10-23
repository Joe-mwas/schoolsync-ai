import Link from "next/link";
import { baseLevel, LEVEL_NAMES } from "@/lib/cbc";
import { learnerAssessments, type Assessment } from "@/lib/results";
import { ASSESSMENT_TYPES, type AssessmentType, type Database, type User } from "@/lib/types";

/**
 * A parent's view of results: every quiz, CAT, opener, mid-term and
 * end-term exam for each child, newest first, with how each learning area
 * has moved over time.
 */

const FILTERS: { key: "" | AssessmentType; label: string }[] = [
  { key: "", label: "All" },
  { key: "quiz", label: "Quizzes & CATs" },
  { key: "opener", label: "Openers" },
  { key: "midterm", label: "Mid-term" },
  { key: "endterm", label: "End-term" },
  { key: "other", label: "Other" },
];

const day = (iso: string) => (iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", year: "numeric" }) : "");

function Level({ level, score, outOf }: { level: string; score?: number | null; outOf?: number | null }) {
  const base = baseLevel(level);
  return (
    <span className={`lvl lvl-${base}`} title={LEVEL_NAMES[base]}>
      <i aria-hidden="true" />
      {score !== null && score !== undefined && outOf ? <span><strong>{score}</strong>/{outOf} · {level}</span> : level}
    </span>
  );
}

export default function FamilyResults({ db, parent, childId, type }: { db: Database; parent: User; childId: string; type: string }) {
  const children = db.users.filter((u) => parent.childIds.includes(u.id) && u.role === "student");
  if (children.length === 0) {
    return <p className="muted">No learners are linked to your account yet. Please contact the school office.</p>;
  }
  const child = children.find((c) => c.id === childId) ?? children[0];
  const all = learnerAssessments(db, child.id);
  const filter = (FILTERS.some((f) => f.key === type) ? type : "") as "" | AssessmentType;
  const shown = filter ? all.filter((a) => a.type === filter) : all;
  const present = new Set(all.map((a) => a.type));
  const qs = (c: string, t: string) => `/results?${new URLSearchParams({ ...(children.length > 1 ? { child: c } : {}), ...(t ? { type: t } : {}) })}`;
  const className = child.classIds.map((id) => db.classes.find((c) => c.id === id)?.name).filter(Boolean).join(", ");

  return (
    <div className="stack">
      {children.length > 1 && (
        <nav className="chip-row" aria-label="Choose a child">
          {children.map((c) => (
            <Link key={c.id} href={qs(c.id, filter)} className={`chip${c.id === child.id ? " is-on" : ""}`} aria-current={c.id === child.id ? "page" : undefined}>{c.name}</Link>
          ))}
        </nav>
      )}

      <div className="card stack" style={{ gap: 10 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={{ margin: 0 }}>{child.name}</h2>
          <span className="small muted">{className}{all.length ? ` · ${all.length} assessment${all.length === 1 ? "" : "s"}` : ""}</span>
        </div>
        {all.length > 0 && (
          <nav className="chip-row" aria-label="Type of assessment">
            {FILTERS.filter((f) => !f.key || present.has(f.key)).map((f) => (
              <Link key={f.key || "all"} href={qs(child.id, f.key)} className={`chip${filter === f.key ? " is-on" : ""}`} aria-current={filter === f.key ? "page" : undefined}>{f.label}</Link>
            ))}
          </nav>
        )}
      </div>

      {all.length === 0 ? (
        <p className="muted">No results have been published for {child.name} yet. They appear here as soon as teachers enter them.</p>
      ) : (
        <>
          {shown.length > 1 && <Progress assessments={shown} />}
          {shown.map((a) => <AssessmentCard key={a.exam} a={a} />)}
          {shown.length === 0 && <p className="muted">No results of this type yet.</p>}
        </>
      )}
      <p className="small muted" style={{ margin: 0 }}>
        Levels: EE = Exceeding, ME = Meeting, AE = Approaching, BE = Below Expectations (1 and 2 are the higher and lower half of each).
        You can also get the latest results on WhatsApp: message the school and reply 1.
      </p>
    </div>
  );
}

/** Each learning area across the last few assessments, oldest to newest, with the direction of the latest change. */
function Progress({ assessments }: { assessments: Assessment[] }) {
  const recent = assessments.slice(0, 5).reverse();
  const areas = [...new Set(recent.flatMap((a) => a.areas.map((x) => x.area)))].sort();
  const score = (l: string) => ({ EE: 4, ME: 3, AE: 2, BE: 1 })[baseLevel(l)] + (l.endsWith("1") ? 0.25 : l.endsWith("2") ? -0.25 : 0);
  return (
    <section className="card stack" aria-labelledby="progress-title">
      <div>
        <h2 id="progress-title" style={{ margin: 0 }}>Progress by learning area</h2>
        <p className="small muted" style={{ margin: "4px 0 0" }}>The last {recent.length} assessments, oldest on the left.</p>
      </div>
      <div className="table-wrap">
        <table className="progress-table">
          <thead>
            <tr>
              <th>Learning area</th>
              {recent.map((a) => <th key={a.exam} title={ASSESSMENT_TYPES[a.type]}>{a.exam}</th>)}
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            {areas.map((area) => {
              const cells = recent.map((a) => a.areas.find((x) => x.area === area));
              const done = cells.filter(Boolean) as NonNullable<(typeof cells)[number]>[];
              const [prev, last] = done.slice(-2);
              const diff = prev && last ? score(last.level) - score(prev.level) : 0;
              return (
                <tr key={area}>
                  <td>{area}</td>
                  {cells.map((c, i) => <td key={i}>{c ? <Level level={c.level} /> : <span className="muted">—</span>}</td>)}
                  <td className="nowrap">
                    {!prev ? <span className="muted">—</span> : diff > 0 ? <span className="trend up">▲ Up</span> : diff < 0 ? <span className="trend down">▼ Down</span> : <span className="muted">● Same</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AssessmentCard({ a }: { a: Assessment }) {
  return (
    <section className="card stack assessment" aria-label={a.exam}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <h3 style={{ margin: 0 }}>{a.exam}</h3>
          <span className="small muted">{ASSESSMENT_TYPES[a.type]}{a.outOf ? ` · out of ${a.outOf}` : ""}{a.date ? ` · ${day(a.date)}` : ""}</span>
        </div>
        <div className="overall">
          <span className="small muted">Overall</span>
          <Level level={a.overall.level} />
          {a.overall.percent !== null && <span className="small muted">{a.overall.percent}%</span>}
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <tbody>
            {a.areas.map((x) => (
              <tr key={x.area}>
                <td>{x.area}</td>
                <td style={{ textAlign: "right" }}><Level level={x.level} score={x.score} outOf={a.outOf} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {a.comment && <div className="small"><strong>Teacher&apos;s comment:</strong> {a.comment}</div>}
    </section>
  );
}
