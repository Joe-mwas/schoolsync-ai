import { errorResponse, requireApiUser } from "@/lib/auth";
import { mutateDb, readDb } from "@/lib/db";
import { notificationsFor, unreadCount } from "@/lib/notifications";

/** GET: this person's notifications and how many are new. */
export async function GET() {
  try {
    const user = await requireApiUser(undefined, { allowPendingPasswordChange: true, allowPendingTwoStep: true });
    const items = notificationsFor(user, await readDb());
    return Response.json({ items, unread: unreadCount(user, items), seenAt: user.notificationsSeenAt ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST: they opened the bell; everything up to now counts as read. */
export async function POST() {
  try {
    const user = await requireApiUser(undefined, { allowPendingPasswordChange: true, allowPendingTwoStep: true });
    const now = new Date().toISOString();
    await mutateDb((db) => {
      const u = db.users.find((x) => x.id === user.id);
      if (u) u.notificationsSeenAt = now;
    });
    return Response.json({ ok: true, seenAt: now });
  } catch (err) {
    return errorResponse(err);
  }
}
