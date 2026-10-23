import { readDb } from "./db.ts";
import { canSeeAnnouncement } from "./permissions.ts";
import { pushTo } from "./push.ts";
import { WHATSAPP_INBOX, type Announcement, type Assignment, type PasswordHelpRequest } from "./types.ts";

/**
 * Who gets a phone notification when something happens. Each sends to the
 * devices of the people concerned and never throws. Lock screens show the
 * text, so it says what happened without private details (no marks, no
 * message contents).
 */

export async function alertAnnouncement(a: Announcement): Promise<void> {
  const db = await readDb();
  const to = db.users.filter((u) => u.id !== a.authorId && canSeeAnnouncement(u, a, db)).map((u) => u.id);
  const kind = a.posterId ? "New poster" : a.priority === "urgent" ? "Urgent" : "New announcement";
  await pushTo(to, { title: `${kind}: ${a.title}`, body: a.body.slice(0, 160), url: "/dashboard#noticeboard", tag: `a-${a.id}` });
}

/** New results for these learners: their parents (and the learners) are told. */
export async function alertResults(studentIds: Iterable<string>, exam: string): Promise<void> {
  const ids = new Set(studentIds);
  if (ids.size === 0) return;
  const db = await readDb();
  for (const parent of db.users.filter((u) => u.role === "parent" && u.childIds.some((c) => ids.has(c)))) {
    const kids = db.users.filter((u) => parent.childIds.includes(u.id) && ids.has(u.id));
    for (const kid of kids) {
      await pushTo([parent.id], { title: `New results for ${kid.name}`, body: `${exam} results are in. Tap to see them.`, url: `/results?child=${kid.id}`, tag: `r-${kid.id}-${exam}` });
    }
  }
  await pushTo(ids, { title: "Your new results are in", body: exam, url: "/dashboard", tag: `r-${exam}` });
}

export async function alertAssignment(a: Assignment): Promise<void> {
  const db = await readDb();
  const to = db.users.filter((u) => u.role === "student" && u.classIds.some((c) => a.classIds.includes(c))).map((u) => u.id);
  await pushTo(to, { title: `${a.kind === "assignment" ? "New assignment" : "New revision material"}: ${a.title}`, body: `${a.subject}${a.dueDate ? ` · due ${a.dueDate}` : ""}`, url: "/assignments", tag: `as-${a.id}` });
}

/** A WhatsApp message the system couldn't answer by itself: the office is told it's waiting. */
export async function alertWhatsAppWaiting(fromName: string): Promise<void> {
  const db = await readDb();
  const to = db.users.filter((u) => WHATSAPP_INBOX.includes(u.role)).map((u) => u.id);
  await pushTo(to, { title: "WhatsApp message waiting", body: `${fromName} sent a message that needs a reply from the office.`, url: "/whatsapp", tag: "wa-waiting" });
}

export async function alertPasswordHelp(r: PasswordHelpRequest): Promise<void> {
  const db = await readDb();
  const to = db.users.filter((u) => u.role === "admin").map((u) => u.id);
  await pushTo(to, { title: `${r.name} needs help signing in`, body: r.userId ? "Tap to give them a temporary password." : "No account yet: tap to add them.", url: "/dashboard", tag: `h-${r.id}` });
}
