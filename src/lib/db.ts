import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
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
}

const g = globalThis as typeof globalThis & { __schoolsyncStore?: Store };
const store: Store = (g.__schoolsyncStore ??= { db: null, queue: Promise.resolve() });

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
    return result;
  });
  store.queue = run.catch(() => undefined);
  return run;
}

/** Drop the in-memory copy (used by tests that swap DATA_FILE). */
export function resetDbCache(): void {
  store.db = null;
}

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}
