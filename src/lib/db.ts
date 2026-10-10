import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { backupDir, dailySnapshotDue, listSnapshots, writeSnapshot, type SnapshotReason } from "./backup.ts";
import { initialDatabase } from "./seed.ts";
import type { Database } from "./types.ts";

/**
 * A small JSON-file datastore. Every mutation runs through a single queue so
 * concurrent requests never interleave read-modify-write cycles, and writes go
 * to a temp file first so a crash can't leave a half-written database.
 */

function dataFile(): string {
  return process.env.DATA_FILE || path.join(process.cwd(), "data", "db.json");
}

interface Store {
  db: Database | null;
  queue: Promise<unknown>;
  /** When the next automatic daily snapshot is worth checking for. */
  nextDailyCheck: number;
}

const g = globalThis as typeof globalThis & { __schoolsyncStore?: Store };
const store: Store = (g.__schoolsyncStore ??= { db: null, queue: Promise.resolve(), nextDailyCheck: 0 });

async function load(): Promise<Database> {
  if (store.db) return store.db;
  try {
    store.db = JSON.parse(await readFile(dataFile(), "utf8")) as Database;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    store.db = initialDatabase();
    await persist(store.db);
  }
  return store.db;
}

async function persist(db: Database): Promise<void> {
  const file = dataFile();
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(db, null, 2));
  await rename(tmp, file);
}

/** Read a snapshot of the database. Callers must not mutate it. */
export async function readDb(): Promise<Database> {
  await store.queue;
  return load();
}

/**
 * Apply a mutation atomically and persist it. The mutation runs on a copy, so
 * if it throws partway through (e.g. a validation error) nothing is kept.
 */
export function mutateDb<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
  const run = store.queue.then(async () => {
    const draft = structuredClone(await load());
    const result = await fn(draft);
    await persist(draft);
    store.db = draft;
    await maybeDailySnapshot(draft);
    return result;
  });
  store.queue = run.catch(() => undefined);
  return run;
}

/**
 * Take the day's automatic snapshot on the first change of the day. Runs in
 * the write queue, so it never sees a half-applied change. A failed backup is
 * logged but never fails the user's change.
 */
async function maybeDailySnapshot(db: Database): Promise<void> {
  if (Date.now() < store.nextDailyCheck) return;
  try {
    const dir = backupDir(dataFile());
    if (dailySnapshotDue(await listSnapshots(dir))) await writeSnapshot(dir, db, "daily");
    store.nextDailyCheck = Date.now() + 60 * 60 * 1000;
  } catch (err) {
    console.error("daily backup failed", err);
    store.nextDailyCheck = Date.now() + 10 * 60 * 1000;
  }
}

/** Snapshot the current data, in the write queue so it's consistent. */
export function snapshotDb(reason: SnapshotReason) {
  const run = store.queue.then(async () => writeSnapshot(backupDir(dataFile()), await load(), reason));
  store.queue = run.catch(() => undefined);
  return run;
}

/** Replace all data with a restored backup, snapshotting the current data first. */
export function replaceDb(next: Database) {
  const run = store.queue.then(async () => {
    await writeSnapshot(backupDir(dataFile()), await load(), "before-restore");
    await persist(next);
    store.db = next;
  });
  store.queue = run.catch(() => undefined);
  return run;
}

export function backupDirectory(): string {
  return backupDir(dataFile());
}

/** Drop the in-memory copy (used by tests that swap DATA_FILE). */
export function resetDbCache(): void {
  store.db = null;
  store.nextDailyCheck = 0;
}

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}
