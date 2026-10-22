import { createHash, createHmac } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { encryptionConfigured, seal } from "./dataCrypto.ts";

/**
 * Off-site backups: once a day an encrypted copy of all the school's data is
 * uploaded to S3-compatible storage outside Render (Cloudflare R2, Backblaze
 * B2 or Amazon S3), so a lost disk or account never loses the school's data.
 * Copies are only ever uploaded encrypted.
 */

type Env = Record<string, string | undefined>;

export interface OffsiteConfig {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
}

export function offsiteConfig(env: Env = process.env): OffsiteConfig | null {
  const v = (k: string) => env[k]?.trim() ?? "";
  const endpoint = v("OFFSITE_BACKUP_ENDPOINT").replace(/\/+$/, "");
  const bucket = v("OFFSITE_BACKUP_BUCKET");
  const accessKeyId = v("OFFSITE_BACKUP_ACCESS_KEY_ID");
  const secretAccessKey = v("OFFSITE_BACKUP_SECRET_ACCESS_KEY");
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return { endpoint, bucket, accessKeyId, secretAccessKey, region: v("OFFSITE_BACKUP_REGION") || "auto", prefix: v("OFFSITE_BACKUP_PREFIX").replace(/^\/+|\/+$/g, "") || "schoolsync" };
}

const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();

/**
 * AWS Signature Version 4 for one request (the scheme every S3-compatible
 * store accepts). `headers` must include host, x-amz-date and
 * x-amz-content-sha256; returns the Authorization header value.
 */
export function signV4(opts: { method: string; path: string; query?: string; headers: Record<string, string>; region: string; accessKeyId: string; secretAccessKey: string; service?: string }): string {
  const service = opts.service ?? "s3";
  const amzDate = opts.headers["x-amz-date"];
  const day = amzDate.slice(0, 8);
  const names = Object.keys(opts.headers).map((h) => h.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(opts.headers).map(([k, v]) => [k.toLowerCase(), v.trim()]));
  const canonical = [opts.method, opts.path, opts.query ?? "", ...names.map((n) => `${n}:${lower[n]}`), "", names.join(";"), lower["x-amz-content-sha256"]].join("\n");
  const scope = `${day}/${opts.region}/${service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${opts.secretAccessKey}`, day), opts.region), service), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(toSign).digest("hex");
  return `AWS4-HMAC-SHA256 Credential=${opts.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`;
}

/** Upload one object (path-style URL, which R2, B2 and S3 all accept). */
export async function putObject(cfg: OffsiteConfig, key: string, body: Buffer, now = new Date()): Promise<void> {
  const url = new URL(`${cfg.endpoint}/${encodeURIComponent(cfg.bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`);
  const headers: Record<string, string> = {
    host: url.host,
    "content-type": "application/octet-stream",
    "x-amz-content-sha256": sha256(body),
    "x-amz-date": now.toISOString().replace(/[:-]|\.\d{3}/g, ""),
  };
  const authorization = signV4({ method: "PUT", path: url.pathname, headers, region: cfg.region, accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey });
  const { host: _host, ...sent } = headers;
  const res = await fetch(url, { method: "PUT", headers: { ...sent, authorization }, body: new Uint8Array(body), signal: AbortSignal.timeout(60_000) });
  if (!res.ok) {
    const text = (await res.text().catch(() => "")).slice(0, 300);
    const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1];
    throw new Error(
      res.status === 403 || code === "SignatureDoesNotMatch" || code === "InvalidAccessKeyId"
        ? `The storage rejected the access key (${code ?? `HTTP ${res.status}`}). Check OFFSITE_BACKUP_ACCESS_KEY_ID and OFFSITE_BACKUP_SECRET_ACCESS_KEY, and that the key may write to the bucket.`
        : code === "NoSuchBucket"
        ? `The bucket "${cfg.bucket}" doesn't exist at ${cfg.endpoint}. Check OFFSITE_BACKUP_BUCKET and OFFSITE_BACKUP_ENDPOINT.`
        : `Upload failed: ${code ?? `HTTP ${res.status}`}`,
    );
  }
}

export interface OffsiteStatus {
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  lastObject: string | null;
  bytes: number;
}

const EMPTY: OffsiteStatus = { lastSuccessAt: null, lastAttemptAt: null, lastError: null, lastObject: null, bytes: 0 };
const statusFile = (backupDir: string) => path.join(backupDir, "offsite-status.json");

export async function readOffsiteStatus(backupDir: string): Promise<OffsiteStatus> {
  try {
    return { ...EMPTY, ...(JSON.parse(await readFile(statusFile(backupDir), "utf8")) as Partial<OffsiteStatus>) };
  } catch {
    return { ...EMPTY };
  }
}

async function saveStatus(backupDir: string, s: OffsiteStatus): Promise<void> {
  await mkdir(backupDir, { recursive: true });
  await writeFile(statusFile(backupDir), JSON.stringify(s, null, 2));
}

/** The object name for a day's copy: one per day, so a re-run the same day replaces it. */
export function offsiteObjectName(prefix: string, at = new Date()): string {
  return `${prefix}/${at.toISOString().slice(0, 10)}.json.gz.enc`;
}

/** Encrypt and upload the given data now, recording the outcome. */
export async function uploadOffsite(data: unknown, backupDir: string, env: Env = process.env, now = new Date()): Promise<OffsiteStatus> {
  const cfg = offsiteConfig(env);
  if (!cfg) throw new Error("Off-site backup isn't set up: add the OFFSITE_BACKUP_* settings in Render → Environment.");
  if (!encryptionConfigured(env)) throw new Error("Set DATA_ENCRYPTION_KEY first: off-site copies are only ever uploaded encrypted.");
  const prev = await readOffsiteStatus(backupDir);
  const key = offsiteObjectName(cfg.prefix, now);
  const body = seal(gzipSync(JSON.stringify(data)), env);
  try {
    await putObject(cfg, key, body, now);
    const s: OffsiteStatus = { lastSuccessAt: now.toISOString(), lastAttemptAt: now.toISOString(), lastError: null, lastObject: key, bytes: body.length };
    await saveStatus(backupDir, s);
    return s;
  } catch (err) {
    const s: OffsiteStatus = { ...prev, lastAttemptAt: now.toISOString(), lastError: err instanceof Error ? err.message : String(err) };
    await saveStatus(backupDir, s);
    throw err;
  }
}

/** Due when set up and the last good upload is ~a day old; a failure is retried after an hour. */
export function offsiteDue(s: OffsiteStatus, now = Date.now()): boolean {
  if (s.lastAttemptAt && now - Date.parse(s.lastAttemptAt) < 60 * 60_000 && s.lastError) return false;
  return !s.lastSuccessAt || now - Date.parse(s.lastSuccessAt) >= 23 * 60 * 60_000;
}
