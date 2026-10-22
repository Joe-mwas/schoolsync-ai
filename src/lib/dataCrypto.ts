import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Encryption at rest for the data file and every backup (AES-256-GCM, which
 * also detects tampering). The key comes from DATA_ENCRYPTION_KEY; when it
 * changes, the old one goes in DATA_ENCRYPTION_KEY_PREVIOUS so existing files
 * can still be opened (they're re-saved with the new key on the next change).
 */

type Env = Record<string, string | undefined>;

const MAGIC = Buffer.from("SSENC1");
const IV_BYTES = 12;
const TAG_BYTES = 16;
export const MIN_KEY_LENGTH = 32;

const derived = new Map<string, Buffer>();
function derive(secret: string): Buffer {
  let key = derived.get(secret);
  if (!key) {
    key = scryptSync(secret, "schoolsync-data-v1", 32);
    derived.set(secret, key);
  }
  return key;
}

function secretFrom(env: Env, name: string): string | null {
  const v = env[name]?.trim();
  if (!v) return null;
  if (v.length < MIN_KEY_LENGTH) throw new Error(`${name} must be at least ${MIN_KEY_LENGTH} characters (use Generate a key on the Setup page)`);
  return v;
}

/** The key new files are written with, or null when encryption isn't set up. */
export function encryptionKey(env: Env = process.env): Buffer | null {
  const s = secretFrom(env, "DATA_ENCRYPTION_KEY");
  return s ? derive(s) : null;
}

export function encryptionConfigured(env: Env = process.env): boolean {
  try {
    return encryptionKey(env) !== null;
  } catch {
    return false;
  }
}

/** Keys that may open existing files: the current one, then the previous one. */
function readKeys(env: Env): Buffer[] {
  return [secretFrom(env, "DATA_ENCRYPTION_KEY"), secretFrom(env, "DATA_ENCRYPTION_KEY_PREVIOUS")].filter((s): s is string => s !== null).map(derive);
}

export function isEncrypted(data: Buffer): boolean {
  return data.length > MAGIC.length && data.subarray(0, MAGIC.length).equals(MAGIC);
}

export function encrypt(plain: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(MAGIC);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

/** Open an encrypted file with the current or previous key. */
export function decrypt(data: Buffer, env: Env = process.env): Buffer {
  const keys = readKeys(env);
  if (keys.length === 0) throw new Error("This file is encrypted, but DATA_ENCRYPTION_KEY isn't set. Add the key it was saved with in Render → Environment.");
  const iv = data.subarray(MAGIC.length, MAGIC.length + IV_BYTES);
  const tag = data.subarray(MAGIC.length + IV_BYTES, MAGIC.length + IV_BYTES + TAG_BYTES);
  const body = data.subarray(MAGIC.length + IV_BYTES + TAG_BYTES);
  for (const key of keys) {
    try {
      const d = createDecipheriv("aes-256-gcm", key, iv);
      d.setAAD(MAGIC);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(body), d.final()]);
    } catch {
      /* try the next key */
    }
  }
  throw new Error("This file couldn't be decrypted: DATA_ENCRYPTION_KEY doesn't match the key it was saved with (or the file was changed).");
}

/** Encrypt when a key is set; otherwise leave as is. */
export function seal(plain: Buffer, env: Env = process.env): Buffer {
  const key = encryptionKey(env);
  return key ? encrypt(plain, key) : plain;
}

/** Decrypt when the data is encrypted; otherwise leave as is. */
export function unseal(data: Buffer, env: Env = process.env): Buffer {
  return isEncrypted(data) ? decrypt(data, env) : data;
}
