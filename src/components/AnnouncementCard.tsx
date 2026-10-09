import type { Announcement, Poster } from "@/lib/types";
import PosterPreview from "./PosterPreview";
import { ROLE_LABELS } from "@/lib/permissions";

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function AnnouncementCard({
  a,
  authorName,
  className,
  poster,
  children,
}: {
  a: Announcement;
  authorName: string;
  className: string | null;
  poster?: Poster | null;
  children?: React.ReactNode;
}) {
  return (
    <article className={`card announcement ${a.priority === "urgent" ? "urgent" : ""}`}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3>{a.title}</h3>
        <div className="row">
          {a.priority === "urgent" && <span className="badge urgent">Urgent</span>}
          <span className="badge">{className ?? "School-wide"}</span>
        </div>
      </div>
      <p className="announcement-body">{a.body}</p>
      {poster && <PosterPreview design={poster.design} />}
      <div className="row small muted" style={{ justifyContent: "space-between" }}>
        <span>
          {authorName} · {formatDate(a.createdAt)} · For {a.audience.map((r) => ROLE_LABELS[r]).join(", ")}
          {a.whatsappSentAt ? " · Sent on WhatsApp" : ""}
        </span>
        {children}
      </div>
    </article>
  );
}
