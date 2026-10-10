import { randomBytes, randomInt, scrypt, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(expected, actual);
}

/** Same format as hashPassword, but runs on the thread pool so bulk imports don't block requests. */
export function hashPasswordAsync(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(`${salt}:${key.toString("hex")}`)));
  });
}

/** Easy-to-read temporary password, e.g. "k7mq-x3vd". */
export function generateTemporaryPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const pick = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("");
  return `${pick()}-${pick()}`;
}
