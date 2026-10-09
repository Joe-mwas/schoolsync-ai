import AnnouncementCard from "@/components/AnnouncementCard";
import { aiConfigured } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { canManageAnnouncement, canPublish, visibleAnnouncements } from "@/lib/permissions";
import AnnouncementActions from "./AnnouncementActions";
import Composer from "./Composer";

export default async function AnnouncementsPage() {
  const user = await requireUser();
  const db = await readDb();
  const names = new Map(db.users.map((u) => [u.id, u.name]));
  const classes = new Map(db.classes.map((c) => [c.id, c.name]));
  const posters = new Map(db.posters.map((p) => [p.id, p]));
  const list = visibleAnnouncements(user, db);

  const classOptions = (user.role === "director" ? db.classes : db.classes.filter((c) => user.classIds.includes(c.id))).map((c) => ({
    id: c.id,
    name: c.name,
  }));
  const posterOptions = db.posters
    .filter((p) => user.role === "director" || p.authorId === user.id)
    .map((p) => ({ id: p.id, name: p.name }));

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>Announcements</h1>
          <p>{canPublish(user) ? "Publish updates and reach families on WhatsApp." : "News and notices from your school."}</p>
        </div>
      </div>
      {canPublish(user) && (
        <Composer
          role={user.role}
          classes={classOptions}
          posters={posterOptions}
          aiEnabled={aiConfigured()}
        />
      )}
      {list.length === 0 && <p className="muted">No announcements yet.</p>}
      {list.map((a) => (
        <AnnouncementCard
          key={a.id}
          a={a}
          authorName={names.get(a.authorId) ?? "Unknown"}
          className={a.classId ? classes.get(a.classId) ?? null : null}
          poster={a.posterId ? posters.get(a.posterId) ?? null : null}
        >
          {canManageAnnouncement(user, a) && <AnnouncementActions id={a.id} sent={Boolean(a.whatsappSentAt)} />}
        </AnnouncementCard>
      ))}
    </div>
  );
}
