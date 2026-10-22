import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { isEncrypted, seal, unseal } from "./dataCrypto.ts";
import { HttpError } from "./errors.ts";
import { ROLES, type Database } from "./types.ts";

/**
 * Compressed snapshots of the datastore, kept next to it in a "backups"
 * folder (encrypted when DATA_ENCRYPTION_KEY is set). They protect against mistakes (a bad import, an accidental
 * delete); downloading them protects against losing the disk itself.
 */

export type SnapshotReason = "daily" | "manual" | "before-import" | "before-restore";

export interface Snapshot {
  name: string;
  reason: SnapshotReason;
  createdAt: string;
  bytes: number;
}

export const KEEP_DAILY = 14;
export const KEEP_OTHER = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const NAME_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z_(daily|manual|before-import|before-restore)\.json\.gz$/;

export function backupDir(dataFile: string): string {
  return path.join(path.dirname(dataFile), "backups");
}

export function snapshotName(reason: SnapshotReason, at = new Date()): string {
  return `${at.toISOString().replace(/:/g, "-").replace(".", "-")}_${reason}.json.gz`;
}

export function parseSnapshotName(name: string): { reason: SnapshotReason; createdAt: string } | null {
  const m = NAME_RE.exec(name);
  if (!m) return null;
  return { createdAt: `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`, reason: m[6] as SnapshotReason };
}

export async function listSnapshots(dir: string): Promise<Snapshot[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: Snapshot[] = [];
  for (const name of names) {
    const meta = parseSnapshotName(name);
    if (!meta) continue;
    out.push({ name, ...meta, bytes: (await stat(path.join(dir, name))).size });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function writeSnapshot(dir: string, db: Database, reason: SnapshotReason, at = new Date()): Promise<Snapshot> {
  await mkdir(dir, { recursive: true });
  const name = snapshotName(reason, at);
  const data = seal(gzipSync(JSON.stringify(db)));
  const tmp = path.join(dir, `${name}.tmp`);
  await writeFile(tmp, data);
  await rename(tmp, path.join(dir, name));
  await pruneSnapshots(dir);
  return { name, reason, createdAt: at.toISOString(), bytes: data.length };
}

/** Keep the newest KEEP_DAILY daily snapshots and KEEP_OTHER of everything else. */
export async function pruneSnapshots(dir: string): Promise<void> {
  const all = await listSnapshots(dir);
  const daily = all.filter((s) => s.reason === "daily").slice(KEEP_DAILY);
  const other = all.filter((s) => s.reason !== "daily").slice(KEEP_OTHER);
  await Promise.all([...daily, ...other].map((s) => unlink(path.join(dir, s.name)).catch(() => undefined)));
}

/** Only names from our own listing format can be read, which rules out path tricks. */
export async function readSnapshot(dir: string, name: string): Promise<Buffer> {
  if (!parseSnapshotName(name)) throw new HttpError(400, "Unknown backup");
  try {
    return await readFile(path.join(dir, name));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new HttpError(404, "Backup not found");
    throw err;
  }
}

/** Encrypt backups saved before encryption was turned on. */
export async function encryptPlainSnapshots(dir: string): Promise<number> {
  let n = 0;
  for (const s of await listSnapshots(dir)) {
    const file = path.join(dir, s.name);
    const data = await readFile(file);
    if (isEncrypted(data)) continue;
    await writeFile(`${file}.tmp`, seal(data));
    await rename(`${file}.tmp`, file);
    n++;
  }
  return n;
}

/** Whether a backup file needs the encryption key to open (for naming downloads). */
export { isEncrypted as backupIsEncrypted };

export function decodeBackup(data: Buffer | string): Database {
  let text: string;
  let raw = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  try {
    raw = unseal(raw);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : "That backup couldn't be decrypted");
  }
  try {
    const buf = raw;
    text = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf).toString("utf8") : buf.toString("utf8");
    return validateDatabase(JSON.parse(text.replace(/^﻿/, "")));
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, "That file isn't a SchoolSync backup");
  }
}

/** Check a restored file has the shape the app relies on before it replaces live data. */
export function validateDatabase(value: unknown): Database {
  const bad = (why: string): never => {
    throw new HttpError(400, `That file isn't a valid SchoolSync backup (${why})`);
  };
  if (!value || typeof value !== "object") bad("not an object");
  const db = value as Record<string, unknown>;
  for (const key of ["users", "classes", "announcements", "events", "posters", "whatsappMessages"]) {
    if (!Array.isArray(db[key])) bad(`missing ${key}`);
  }
  for (const u of db.users as Record<string, unknown>[]) {
    if (
      !u || typeof u.id !== "string" || typeof u.name !== "string" || typeof u.email !== "string" ||
      typeof u.passwordHash !== "string" || !(ROLES as readonly string[]).includes(u.role as string) ||
      !Array.isArray(u.classIds) || !Array.isArray(u.childIds)
    ) {
      bad("a person record is incomplete");
    }
  }
  if (!(db.users as { role: string }[]).some((u) => u.role === "director" || u.role === "admin")) {
    bad("it has no administrator or director account");
  }
  return value as Database;
}

/** True when the newest daily snapshot is older than a day (or there is none). */
export function dailySnapshotDue(snapshots: Snapshot[], now = Date.now()): boolean {
  const last = snapshots.find((s) => s.reason === "daily");
  return !last || now - Date.parse(last.createdAt) >= DAY_MS;
}
