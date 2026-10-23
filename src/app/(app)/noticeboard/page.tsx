import Link from "next/link";
import { formatDate } from "@/components/AnnouncementCard";
import PosterPreview from "@/components/PosterPreview";
import { requireUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { canPublish, visibleAnnouncements } from "@/lib/permissions";
import { POSTER_MAKERS, type Announcement } from "@/lib/types";

/**
 * The school noticeboard: every poster and announcement this person is
 * meant to see, newest first, posters shown large. New ones (since they
 * last opened the bell) are marked.
 */
export default async function NoticeboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const db = await readDb();
  const { show } = await searchParams;
  const filter = show === "posters" || show === "notices" ? show : "all";
  const all = visibleAnnouncements(user, db);
  const items = all.filter((a) => (filter === "posters" ? a.posterId : filter === "notices" ? !a.posterId : true));
  const posters = new Map(db.posters.map((p) => [p.id, p]));
  const names = new Map(db.users.map((u) => [u.id, u.name]));
  const classes = new Map(db.classes.map((c) => [c.id, c.name]));
  const seen = user.notificationsSeenAt ?? "";
  const isNew = (a: Announcement) => a.createdAt > seen && a.authorId !== user.id;
  const chip = (key: string, label: string, n: number) => (
    <Link href={key === "all" ? "/noticeboard" : `/noticeboard?show=${key}`} className={`chip${filter === key ? " is-on" : ""}`} aria-current={filter === key ? "page" : undefined}>
      {label} ({n})
    </Link>
  );

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>📌 Noticeboard</h1>
          <p>Posters and announcements from the school, newest first.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {POSTER_MAKERS.includes(user.role) && <Link href="/posters" className="button secondary small">Make a poster</Link>}
          {canPublish(user) && <Link href="/announcements" className="button small">Post an announcement</Link>}
        </div>
      </div>

      <nav className="chip-row" aria-label="Show">
        {chip("all", "Everything", all.length)}
        {chip("posters", "Posters", all.filter((a) => a.posterId).length)}
        {chip("notices", "Announcements", all.filter((a) => !a.posterId).length)}
      </nav>

      {items.length === 0 ? (
        <div className="card"><p className="muted" style={{ margin: 0 }}>Nothing on the noticeboard yet.</p></div>
      ) : (
        <div className="board">
          {items.map((a) => {
            const poster = a.posterId ? posters.get(a.posterId) : undefined;
            return (
              <article key={a.id} id={`a-${a.id}`} className={`card board-item${poster ? " has-poster" : ""}${a.priority === "urgent" ? " urgent" : ""}${isNew(a) ? " is-new" : ""}`}>
                {poster && <PosterPreview design={poster.design} maxWidth={560} />}
                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <h2 style={{ margin: 0, fontSize: "1.1rem" }}>
                    {a.title}
                    {isNew(a) && <span className="new-tag">New</span>}
                  </h2>
                  <div className="row" style={{ gap: 6 }}>
                    {a.priority === "urgent" && <span className="badge urgent">Urgent</span>}
                    <span className="badge">{a.classId ? classes.get(a.classId) ?? "Class" : "School-wide"}</span>
                  </div>
                </div>
                <p className="announcement-body" style={{ margin: 0 }}>{a.body}</p>
                <div className="small muted">{names.get(a.authorId) ?? "School"} · {formatDate(a.createdAt)}</div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
