import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Two-step sign-in codes (TOTP, RFC 6238): the six-digit code that Google
 * Authenticator, Microsoft Authenticator and similar apps show, changing
 * every 30 seconds. Free, works offline on the phone, needs no SMS.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error("Not a base32 key");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new 160-bit key, as base32. */
export function newSecret(): string {
  return base32Encode(randomBytes(20));
}

export function codeAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1] & 15;
  const n = (mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(n).padStart(6, "0");
}

export const stepAt = (now = Date.now()) => Math.floor(now / 1000 / STEP_SECONDS);

/**
 * The step the code matches (allowing one step of clock drift either way),
 * or null. A step at or before `lastStep` is refused, so each code works once.
 */
export function verifyCode(secret: string, code: string, opts: { now?: number; lastStep?: number } = {}): number | null {
  const digits = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(digits)) return null;
  const current = stepAt(opts.now);
  for (const step of [current, current - 1, current + 1]) {
    if (opts.lastStep !== undefined && step <= opts.lastStep) continue;
    if (timingSafeEqual(Buffer.from(codeAt(secret, step)), Buffer.from(digits))) return step;
  }
  return null;
}

/** The link an authenticator app reads from the QR code. */
export function otpauthUrl(issuer: string, account: string, secret: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}

/** The key in groups of four, easier to type into an app by hand. */
export const formatSecret = (secret: string) => secret.replace(/(.{4})/g, "$1 ").trim();

const hashCode = (code: string) => createHash("sha256").update(code.toLowerCase().replace(/[\s-]/g, "")).digest("hex");

/** Ten one-time backup codes (shown once) and their hashes (stored). */
export function newBackupCodes(count = 10): { codes: string[]; hashes: string[] } {
  const codes = Array.from({ length: count }, () => {
    const raw = base32Encode(randomBytes(5)).toLowerCase();
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
  });
  return { codes, hashes: codes.map(hashCode) };
}

/** The remaining hashes if the code is one of them (it's used up), else null. */
export function spendBackupCode(hashes: string[], code: string): string[] | null {
  const clean = code.toLowerCase().replace(/[\s-]/g, "");
  if (!/^[a-z2-7]{8}$/.test(clean)) return null;
  const h = hashCode(clean);
  const i = hashes.indexOf(h);
  return i === -1 ? null : hashes.filter((_, j) => j !== i);
}
