import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import {
  dailySnapshotDue,
  decodeBackup,
  KEEP_DAILY,
  KEEP_OTHER,
  listSnapshots,
  parseSnapshotName,
  readSnapshot,
  snapshotName,
  writeSnapshot,
} from "../src/lib/backup.ts";
import { backupDirectory, mutateDb, readDb, replaceDb, resetDbCache, snapshotDb } from "../src/lib/db.ts";
import { HttpError } from "../src/lib/errors.ts";
import { seedDatabase } from "../src/lib/seed.ts";

const tmp = () => mkdtemp(path.join(tmpdir(), "schoolsync-bk-"));

test("snapshot names round-trip and reject anything else", () => {
  const at = new Date("2026-10-10T18:40:05.123Z");
  const name = snapshotName("before-import", at);
  assert.equal(name, "2026-10-10T18-40-05-123Z_before-import.json.gz");
  assert.deepEqual(parseSnapshotName(name), { reason: "before-import", createdAt: at.toISOString() });
  for (const bad of ["../db.json", "x.json.gz", "2026-10-10T18-40-05-123Z_daily.json.gz/../../etc"]) {
    assert.equal(parseSnapshotName(bad), null);
  }
});

test("keeps the newest daily and other snapshots, newest first", async () => {
  const dir = await tmp();
  const db = seedDatabase();
  const t0 = Date.parse("2026-01-01T00:00:00Z");
  for (let i = 0; i < KEEP_DAILY + 3; i++) await writeSnapshot(dir, db, "daily", new Date(t0 + i * 86_400_000));
  for (let i = 0; i < KEEP_OTHER + 2; i++) await writeSnapshot(dir, db, "manual", new Date(t0 + i * 1000));
  const list = await listSnapshots(dir);
  assert.equal(list.filter((s) => s.reason === "daily").length, KEEP_DAILY);
  assert.equal(list.filter((s) => s.reason === "manual").length, KEEP_OTHER);
  assert.ok(list[0].createdAt > list[list.length - 1].createdAt);
  // The oldest dailies were the ones removed.
  assert.ok(list.filter((s) => s.reason === "daily").every((s) => Date.parse(s.createdAt) >= t0 + 3 * 86_400_000));
});

test("reads snapshots back, gzipped or plain, and rejects bad files", async () => {
  const dir = await tmp();
  const db = seedDatabase();
  const snap = await writeSnapshot(dir, db, "manual");
  assert.deepEqual(decodeBackup(await readSnapshot(dir, snap.name)).users.map((u) => u.id), db.users.map((u) => u.id));
  assert.equal(decodeBackup(JSON.stringify(db)).users.length, db.users.length);
  assert.equal(decodeBackup(gzipSync("﻿" + JSON.stringify(db))).classes.length, db.classes.length);

  const rejects = (input: Buffer | string, re: RegExp) =>
    assert.throws(() => decodeBackup(input), (e: unknown) => e instanceof HttpError && e.status === 400 && re.test(e.message));
  rejects("not json", /isn't a SchoolSync backup/);
  rejects(JSON.stringify({ users: [] }), /missing classes/);
  rejects(JSON.stringify({ ...db, users: db.users.filter((u) => u.role !== "director") }), /no director/);
  rejects(JSON.stringify({ ...db, users: [...db.users, { id: "x", role: "hacker" }] }), /incomplete/);
  await assert.rejects(readSnapshot(dir, "../../db.json"), /Unknown backup/);
});

test("a daily snapshot is due when the last one is a day old", () => {
  const now = Date.parse("2026-10-10T12:00:00Z");
  const snap = (createdAt: string, reason: "daily" | "manual" = "daily") => ({ name: "", reason, createdAt, bytes: 1 });
  assert.equal(dailySnapshotDue([], now), true);
  assert.equal(dailySnapshotDue([snap("2026-10-10T01:00:00Z")], now), false);
  assert.equal(dailySnapshotDue([snap("2026-10-09T11:59:00Z")], now), true);
  assert.equal(dailySnapshotDue([snap("2026-10-10T11:00:00Z", "manual")], now), true);
});

test("the datastore snapshots daily on change, and restores with an undo point", async () => {
  process.env.DATA_FILE = path.join(await tmp(), "db.json");
  resetDbCache();
  await mutateDb((d) => void (d.events = []));
  await mutateDb((d) => void (d.posters = []));
  let list = await listSnapshots(backupDirectory());
  assert.deepEqual(list.map((s) => s.reason), ["daily"], "one daily snapshot, not one per change");

  const manual = await snapshotDb("manual");
  await mutateDb((d) => void d.users.push({ ...d.users[0], id: "u-later", email: "later@x.org" }));

  // Restore the manual snapshot: the later user disappears and an undo point appears.
  await replaceDb(decodeBackup(await readSnapshot(backupDirectory(), manual.name)));
  assert.ok(!(await readDb()).users.some((u) => u.id === "u-later"));
  const onDisk = JSON.parse(await readFile(process.env.DATA_FILE!, "utf8"));
  assert.ok(!onDisk.users.some((u: { id: string }) => u.id === "u-later"));
  list = await listSnapshots(backupDirectory());
  const undo = list.find((s) => s.reason === "before-restore")!;
  assert.ok(decodeBackup(await readSnapshot(backupDirectory(), undo.name)).users.some((u) => u.id === "u-later"));
  assert.ok((await readdir(backupDirectory())).every((n) => !n.endsWith(".tmp")));
});

test("a failing backup never fails the user's change", async () => {
  const dir = await tmp();
  process.env.DATA_FILE = path.join(dir, "db.json");
  resetDbCache();
  await readDb();
  // A file where the backups folder should be makes snapshots fail.
  await writeFile(path.join(dir, "backups"), "not a folder");
  await mutateDb((d) => void (d.events = []));
  assert.deepEqual((await readDb()).events, []);
});
