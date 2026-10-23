import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/permissions";
import EraseLog from "./EraseLog";
import { ACTIVITY_KINDS, type ActivityEntry, type ActivityKind } from "@/lib/types";

const PAGE = 200;

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Who did what and when: sign-ins, failed sign-ins, and changes to people, fees, results, data and settings. */
export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser(["admin"]);
  const params = await searchParams;
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const kind = one("kind") in ACTIVITY_KINDS ? (one("kind") as ActivityKind) : "";
  const who = one("who");
  const q = one("q").trim().toLowerCase();
  const limit = Math.min(5000, Math.max(PAGE, Number(one("limit")) || PAGE));

  const db = await readDb();
  const all = [...db.activity].reverse();
  const matches = all.filter(
    (a) =>
      (!kind || a.kind === kind) &&
      (!who || a.userId === who) &&
      (!q || `${a.name} ${a.action} ${a.detail}`.toLowerCase().includes(q)),
  );
  const shown = matches.slice(0, limit);
  const day = Date.now() - 24 * 3600_000;
  const failedToday = all.filter((a) => a.action === "Failed sign-in" && Date.parse(a.at) > day).length;
  const people = [...new Map(all.filter((a) => a.userId).map((a) => [a.userId!, a.name])).entries()].sort((x, y) => x[1].localeCompare(y[1]));
  const more = new URLSearchParams({ ...(kind && { kind }), ...(who && { who }), ...(q && { q }), limit: String(limit + PAGE) });

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>Activity log</h1>
          <p>Who signed in, who changed what, and when. Kept with the school&apos;s data (encrypted and backed up with it); the latest 5,000 entries are kept.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {failedToday > 0 && <span className="badge urgent">{failedToday} failed sign-in{failedToday === 1 ? "" : "s"} in 24 hours</span>}
          <EraseLog count={db.activity.length} />
        </div>
      </div>

      <form className="card row activity-filters" method="get">
        <label>
          Type
          <select name="kind" defaultValue={kind}>
            <option value="">Everything</option>
            {Object.entries(ACTIVITY_KINDS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        <label>
          Person
          <select name="who" defaultValue={who}>
            <option value="">Everyone</option>
            {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label style={{ flex: "1 1 200px" }}>
          Search
          <input name="q" defaultValue={one("q")} placeholder="e.g. password, Grade 7, fees" />
        </label>
        <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
          <button type="submit" className="small">Show</button>
          {(kind || who || q) && <Link href="/activity" className="small">Clear</Link>}
        </div>
      </form>

      <div className="card" style={{ padding: 0 }}>
        {shown.length === 0 ? (
          <p className="muted" style={{ padding: 16, margin: 0 }}>{all.length ? "Nothing matches." : "Nothing recorded yet. Sign-ins and changes will appear here."}</p>
        ) : (
          <div className="table-wrap">
            <table className="activity-table">
              <thead>
                <tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr>
              </thead>
              <tbody>
                {shown.map((a) => <Row key={a.id} a={a} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {matches.length > shown.length && (
        <Link href={`/activity?${more}`} className="small">Show more ({matches.length - shown.length} older)</Link>
      )}
    </div>
  );
}

function Row({ a }: { a: ActivityEntry }) {
  const failed = a.action.startsWith("Failed");
  return (
    <tr className={failed ? "is-failed" : undefined}>
      <td className="nowrap">{when(a.at)}</td>
      <td>
        <strong>{a.name}</strong>
        {a.role && <div className="small muted">{ROLE_LABELS[a.role]}</div>}
      </td>
      <td>
        {a.action}
        <div className="small muted">{ACTIVITY_KINDS[a.kind]}</div>
      </td>
      <td className="small">
        {a.detail}
        {a.ip && <div className="muted">from {a.ip}</div>}
      </td>
    </tr>
  );
}
