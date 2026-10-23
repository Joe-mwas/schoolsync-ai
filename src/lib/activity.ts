import { mutateDb, newId } from "./db.ts";
import { clientIp } from "./rateLimit.ts";
import type { ActivityEntry, ActivityKind, Database, User } from "./types.ts";

/**
 * The activity log: who signed in, who changed what, and when. Kept with the
 * data (so it's encrypted and backed up with it), newest last, and capped so
 * it never grows without limit.
 */

export const MAX_ACTIVITY = 5000;

type Actor = Pick<User, "id" | "name" | "role"> | null;

export function recordActivity(db: Database, entry: Omit<ActivityEntry, "id" | "at"> & { at?: string }): ActivityEntry {
  const full: ActivityEntry = {
    id: newId("act"),
    at: entry.at ?? new Date().toISOString(),
    userId: entry.userId,
    name: entry.name.slice(0, 120),
    role: entry.role,
    kind: entry.kind,
    action: entry.action.slice(0, 120),
    detail: entry.detail.replace(/\s+/g, " ").trim().slice(0, 300),
    ...(entry.ip ? { ip: entry.ip.slice(0, 64) } : {}),
  };
  if (!Array.isArray(db.activity)) db.activity = [];
  db.activity.push(full);
  if (db.activity.length > MAX_ACTIVITY) db.activity.splice(0, db.activity.length - MAX_ACTIVITY);
  return full;
}

/** Record something someone did. Never throws: a logging hiccup must not undo the action. */
export async function logActivity(req: Request | null, actor: Actor, kind: ActivityKind, action: string, detail = "", name?: string): Promise<void> {
  try {
    const ip = req ? clientIp(req) : undefined;
    await mutateDb((db) =>
      void recordActivity(db, {
        userId: actor?.id ?? null,
        name: actor?.name ?? name ?? "Unknown",
        role: actor?.role ?? null,
        kind,
        action,
        detail,
        ip: ip && ip !== "unknown" ? ip : undefined,
      }),
    );
  } catch (err) {
    console.error("Couldn't record activity", err);
  }
}
