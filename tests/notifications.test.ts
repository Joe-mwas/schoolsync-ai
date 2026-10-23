import assert from "node:assert/strict";
import { test } from "node:test";
import { migrateDatabase } from "../src/lib/migrate.ts";
import { notificationsFor, unreadCount } from "../src/lib/notifications.ts";
import { removeSubscription, saveSubscription } from "../src/lib/push.ts";
import { seedDatabase, withDemoHistory } from "../src/lib/seed.ts";
import type { Announcement, Database } from "../src/lib/types.ts";

const u = (db: Database, id: string) => db.users.find((x) => x.id === id)!;
const now = new Date();
const iso = (minsAgo: number) => new Date(now.getTime() - minsAgo * 60_000).toISOString();

function poster(db: Database, over: Partial<Announcement> = {}): Announcement {
  const a: Announcement = { id: "a-poster", title: "Sports day", body: "Friday at 9am", audience: ["teacher", "parent", "student"], classId: null, priority: "normal", authorId: "u-teacher1", createdAt: iso(5), posterId: "p1", whatsappSentAt: null, ...over };
  db.announcements.push(a);
  return a;
}

test("a shared poster reaches everyone it's meant for, but not its author", () => {
  const db = seedDatabase();
  poster(db);
  for (const id of ["u-parent1", "u-parent2", "u-student1", "u-director", "u-admin", "u-teacher2"]) {
    const items = notificationsFor(u(db, id), db, now);
    assert.equal(items[0].kind, "poster", id);
    assert.equal(items[0].title, "New poster: Sports day");
  }
  assert.ok(!notificationsFor(u(db, "u-teacher1"), db, now).some((n) => n.id === "a-a-poster"), "not the author");
});

test("a class poster reaches only that class's families", () => {
  const db = seedDatabase();
  poster(db, { classId: "c-grade7", audience: ["parent"] });
  assert.ok(notificationsFor(u(db, "u-parent1"), db, now).some((n) => n.kind === "poster"));
  assert.ok(!notificationsFor(u(db, "u-parent2"), db, now).some((n) => n.kind === "poster"), "Grade 8 parent");
  assert.ok(!notificationsFor(u(db, "u-student1"), db, now).some((n) => n.kind === "poster"), "learners weren't chosen");
});

test("parents hear about results, the office about WhatsApp, the administrator about sign-in help", () => {
  const db = withDemoHistory(seedDatabase());
  const results = notificationsFor(u(db, "u-parent1"), db, now).filter((n) => n.kind === "results");
  assert.ok(results.some((n) => n.title === "New results: Brian Kamau, Maths & Science CAT 2" && n.href === "/results?child=u-student1"));
  assert.ok(!results.some((n) => n.title.includes("Faith")), "only their own child");

  db.whatsappMessages.push({ id: "wa-x", direction: "inbound", phone: "254700000004", userId: "u-parent1", body: "Is there school on Friday?", status: "received", error: null, announcementId: null, createdAt: iso(1) });
  assert.equal(notificationsFor(u(db, "u-secretary"), db, now)[0].title, "WhatsApp from James Kamau");
  assert.ok(!notificationsFor(u(db, "u-teacher1"), db, now).some((n) => n.kind === "whatsapp"), "teachers don't run the inbox");

  db.passwordHelp.push({ id: "pw-1", contact: "0711000000", role: "parent", name: "Ann", note: "", userId: null, status: "open", createdAt: iso(2), handledAt: null, handledBy: null });
  assert.ok(notificationsFor(u(db, "u-admin"), db, now).some((n) => n.kind === "password-help"));
  assert.ok(!notificationsFor(u(db, "u-director"), db, now).some((n) => n.kind === "password-help"));
});

test("only what's newer than the last look counts as unread", () => {
  const db = seedDatabase();
  poster(db);
  const parent = u(db, "u-parent1");
  const items = notificationsFor(parent, db, now);
  assert.equal(unreadCount(parent, items), items.filter((i) => i.at > "").length);
  parent.notificationsSeenAt = iso(0);
  assert.equal(unreadCount(parent, items), 0);
  parent.notificationsSeenAt = iso(10);
  assert.equal(unreadCount(parent, items), 1, "the poster from 5 minutes ago");
});

test("a device's subscription is kept per person, replaced when someone else signs in on it", () => {
  const db = seedDatabase();
  const sub = { endpoint: "https://push.example/abc", keys: { p256dh: "BKey", auth: "secret" } };
  saveSubscription(db, "u-parent1", sub);
  saveSubscription(db, "u-parent1", sub);
  assert.equal(db.push.subscriptions.length, 1, "no duplicates");
  saveSubscription(db, "u-teacher1", sub);
  assert.deepEqual(db.push.subscriptions.map((s) => s.userId), ["u-teacher1"], "the device now belongs to whoever signed in last");
  assert.throws(() => saveSubscription(db, "u-parent1", { endpoint: "http://insecure", keys: sub.keys }), /usable/);
  assert.throws(() => saveSubscription(db, "u-parent1", null), /usable/);
  for (let i = 0; i < 12; i++) saveSubscription(db, "u-parent1", { ...sub, endpoint: `https://push.example/${i}` });
  assert.equal(db.push.subscriptions.filter((s) => s.userId === "u-parent1").length, 10, "newest ten per person");
  assert.equal(removeSubscription(db, "u-parent1", "https://push.example/11"), true);
  assert.equal(removeSubscription(db, "u-parent2", "https://push.example/10"), false, "only your own");
});

test("older data gets an empty push store", () => {
  const db = seedDatabase() as Partial<Database>;
  delete db.push;
  assert.equal(migrateDatabase(db as Database, {}), true);
  assert.deepEqual(db.push, { vapid: null, subscriptions: [] });
});
