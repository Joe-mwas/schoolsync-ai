import type { Announcement, Database, Role, User } from "./types.ts";

/** Class ids relevant to a user: taught, attended, or attended by their children. */
export function userClassIds(user: User, db: Pick<Database, "users">): string[] {
  if (user.role === "parent") {
    return db.users.filter((u) => user.childIds.includes(u.id)).flatMap((u) => u.classIds);
  }
  return user.classIds;
}

export function canSeeAnnouncement(user: User, a: Announcement, db: Pick<Database, "users">): boolean {
  if (user.role === "director" || a.authorId === user.id) return true;
  if (!a.audience.includes(user.role)) return false;
  return a.classId === null || userClassIds(user, db).includes(a.classId);
}

export function visibleAnnouncements(user: User, db: Pick<Database, "users" | "announcements">): Announcement[] {
  return db.announcements
    .filter((a) => canSeeAnnouncement(user, a, db))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function canPublish(user: User): boolean {
  return user.role === "director" || user.role === "teacher";
}

/** Directors may target anything; teachers only their own classes. */
export function canTargetClass(user: User, classId: string | null): boolean {
  if (user.role === "director") return true;
  if (user.role === "teacher") return classId !== null && user.classIds.includes(classId);
  return false;
}

export function canManageAnnouncement(user: User, a: Announcement): boolean {
  return user.role === "director" || a.authorId === user.id;
}

/** Users with a phone number who are in an announcement's audience. */
export function whatsappRecipients(a: Announcement, db: Pick<Database, "users">): User[] {
  return db.users.filter((u) => {
    if (!u.phone || u.id === a.authorId) return false;
    if (!a.audience.includes(u.role)) return false;
    return a.classId === null || userClassIds(u, db).includes(a.classId);
  });
}

export const ROLE_LABELS: Record<Role, string> = {
  director: "Director",
  teacher: "Teacher",
  parent: "Parent",
  student: "Student",
};
