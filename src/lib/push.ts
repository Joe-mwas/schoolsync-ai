import webpush from "web-push";
import { mutateDb, readDb } from "./db.ts";
import { HttpError } from "./errors.ts";
import type { Database, PushSubscriptionRecord } from "./types.ts";

/**
 * Phone and browser notifications (web push). Each phone or browser that
 * says yes is stored against its person; when something happens for them
 * (an announcement, a poster, results, a WhatsApp message for the office)
 * a short notice pops up on that device, even with SchoolSync closed. Free:
 * it goes through the phone's own push service (Google, Apple, Mozilla).
 * On an iPhone it works once SchoolSync is added to the Home Screen.
 */

export interface PushPayload {
  title: string;
  body: string;
  /** The page to open when the notification is tapped. */
  url: string;
  tag?: string;
}

const MAX_PER_USER = 10;

/** This server's VAPID keys, made and saved the first time they're needed. */
export async function vapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const existing = (await readDb()).push?.vapid;
  if (existing) return existing;
  return mutateDb((db) => {
    db.push.vapid ??= webpush.generateVAPIDKeys();
    return db.push.vapid;
  });
}

export function saveSubscription(db: Database, userId: string, input: unknown): PushSubscriptionRecord {
  const sub = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint : "";
  const p256dh = typeof sub?.keys?.p256dh === "string" ? sub.keys.p256dh : "";
  const auth = typeof sub?.keys?.auth === "string" ? sub.keys.auth : "";
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) {
    throw new HttpError(400, "That browser didn't give a usable notification address");
  }
  const record: PushSubscriptionRecord = { userId, endpoint, keys: { p256dh, auth }, createdAt: new Date().toISOString() };
  // A device belongs to whoever signed in on it last; keep each person's newest few.
  const others = db.push.subscriptions.filter((s) => s.endpoint !== endpoint);
  const mine = others.filter((s) => s.userId === userId);
  const drop = new Set(mine.slice(0, Math.max(0, mine.length + 1 - MAX_PER_USER)).map((s) => s.endpoint));
  db.push.subscriptions = [...others.filter((s) => !drop.has(s.endpoint)), record];
  return record;
}

export function removeSubscription(db: Database, userId: string, endpoint: string): boolean {
  const before = db.push.subscriptions.length;
  db.push.subscriptions = db.push.subscriptions.filter((s) => !(s.endpoint === endpoint && s.userId === userId));
  return db.push.subscriptions.length < before;
}

function subject(db: Database): string {
  const email = db.profile?.email?.trim() || db.users.find((u) => u.role === "admin")?.email;
  return email && email.includes("@") ? `mailto:${email}` : "mailto:admin@schoolsync.invalid";
}

/**
 * Send a notification to these people's devices. Never throws, so the action
 * that triggered it always succeeds; devices that have gone away are removed.
 */
export async function pushTo(userIds: Iterable<string>, payload: PushPayload): Promise<{ sent: number; failed: number }> {
  const ids = new Set(userIds);
  let sent = 0;
  let failed = 0;
  try {
    const db = await readDb();
    const subs = (db.push?.subscriptions ?? []).filter((s) => ids.has(s.userId));
    if (subs.length === 0) return { sent, failed };
    const keys = await vapidKeys();
    const options = { vapidDetails: { subject: subject(db), publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 24 * 3600, urgency: "normal" as const };
    const body = JSON.stringify({ ...payload, title: payload.title.slice(0, 120), body: payload.body.slice(0, 240) });
    const gone: string[] = [];
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, options);
          sent++;
        } catch (err) {
          failed++;
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) gone.push(s.endpoint);
          else console.error("Push failed", status ?? err);
        }
      }),
    );
    if (gone.length) await mutateDb((d) => void (d.push.subscriptions = d.push.subscriptions.filter((s) => !gone.includes(s.endpoint))));
  } catch (err) {
    console.error("Push notifications failed", err);
  }
  return { sent, failed };
}
