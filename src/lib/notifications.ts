import { learnerAssessments } from "./results.ts";
import { canSeeAnnouncement } from "./permissions.ts";
import { WHATSAPP_INBOX, type Database, type User } from "./types.ts";

/**
 * The bell: what's new for this person, worked out from the school's data
 * (nothing extra is stored but when they last looked). Announcements and
 * posters for everyone they're meant for; results and payments for
 * families; WhatsApp messages for the office; requests for the administrator.
 */

export type NotificationKind = "announcement" | "poster" | "results" | "payment" | "assignment" | "whatsapp" | "password-help";

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string;
  at: string;
}

const DAYS = 30;
const clip = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function notificationsFor(user: User, db: Database, now = new Date(), limit = 30): NotificationItem[] {
  const since = new Date(now.getTime() - DAYS * 86_400_000).toISOString();
  const items: NotificationItem[] = [];
  const name = (id: string | null) => db.users.find((u) => u.id === id)?.name ?? "Someone";

  for (const a of db.announcements) {
    if (a.createdAt < since || a.authorId === user.id || !canSeeAnnouncement(user, a, db)) continue;
    items.push({
      id: `a-${a.id}`,
      kind: a.posterId ? "poster" : "announcement",
      title: `${a.posterId ? "New poster" : a.priority === "urgent" ? "Urgent announcement" : "New announcement"}: ${a.title}`,
      body: clip(a.body),
      href: `/noticeboard#a-${a.id}`,
      at: a.createdAt,
    });
  }

  const kids = user.role === "parent" ? db.users.filter((u) => user.childIds.includes(u.id) && u.role === "student") : user.role === "student" ? [user] : [];
  for (const kid of kids) {
    for (const a of learnerAssessments(db, kid.id)) {
      if (a.date < since) continue;
      items.push({
        id: `r-${kid.id}-${a.exam}`,
        kind: "results",
        title: `New results: ${user.role === "parent" ? `${kid.name}, ` : ""}${a.exam}`,
        body: `Overall ${a.overall.level}${a.overall.percent !== null ? ` (${a.overall.percent}%)` : ""} in ${a.areas.length} learning area${a.areas.length === 1 ? "" : "s"}.`,
        href: user.role === "parent" ? `/results?child=${kid.id}` : "/dashboard",
        at: a.date,
      });
    }
    if (user.role === "parent") {
      for (const f of db.fees) {
        if (f.studentId !== kid.id || f.kind !== "payment" || f.createdAt < since) continue;
        items.push({ id: `p-${f.id}`, kind: "payment", title: `Fee payment recorded for ${kid.name}`, body: `Ksh ${f.amount.toLocaleString("en-KE")}${f.reference ? ` · ref ${f.reference}` : ""}`, href: "/dashboard", at: f.createdAt });
      }
    }
  }

  if (user.role === "student") {
    for (const a of db.assignments ?? []) {
      if (a.createdAt < since || !a.classIds.some((c) => user.classIds.includes(c))) continue;
      items.push({ id: `as-${a.id}`, kind: "assignment", title: `${a.kind === "assignment" ? "New assignment" : "New revision material"}: ${a.title}`, body: `${a.subject}${a.dueDate ? ` · due ${a.dueDate}` : ""}`, href: "/assignments", at: a.createdAt });
    }
  }

  if (WHATSAPP_INBOX.includes(user.role)) {
    for (const m of db.whatsappMessages) {
      if (m.direction !== "inbound" || m.createdAt < since) continue;
      items.push({ id: `w-${m.id}`, kind: "whatsapp", title: `WhatsApp from ${m.userId ? name(m.userId) : m.phone}`, body: clip(m.body), href: "/whatsapp", at: m.createdAt });
    }
  }

  if (user.role === "admin") {
    for (const r of db.passwordHelp) {
      if (r.status !== "open") continue;
      items.push({ id: `h-${r.id}`, kind: "password-help", title: `${r.name} needs help signing in`, body: `Signs in with ${r.contact}`, href: "/dashboard", at: r.createdAt });
    }
  }

  return items.sort((x, y) => y.at.localeCompare(x.at)).slice(0, limit);
}

export function unreadCount(user: User, items: NotificationItem[]): number {
  const seen = user.notificationsSeenAt ?? "";
  return items.filter((i) => i.at > seen).length;
}
