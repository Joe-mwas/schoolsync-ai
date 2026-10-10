/**
 * In-memory limiter for failed sign-ins. Counts failures in a sliding window
 * both per account (email + IP) and per IP, so one address can't guess many
 * passwords for one account or spray guesses across many accounts.
 *
 * State lives in this server process, which suits the single-instance
 * deployment; it resets on restart.
 */

export interface LimiterOptions {
  windowMs: number;
  maxPerAccount: number;
  maxPerIp: number;
}

export const LOGIN_LIMITS: LimiterOptions = { windowMs: 15 * 60 * 1000, maxPerAccount: 5, maxPerIp: 20 };

export class LoginLimiter {
  private failures = new Map<string, number[]>();
  private opts: LimiterOptions;

  constructor(opts: LimiterOptions = LOGIN_LIMITS) {
    this.opts = opts;
  }

  private keys(ip: string, email: string): [string, number][] {
    return [
      [`acct:${ip}:${email.trim().toLowerCase()}`, this.opts.maxPerAccount],
      [`ip:${ip}`, this.opts.maxPerIp],
    ];
  }

  private recent(key: string, now: number): number[] {
    const list = (this.failures.get(key) ?? []).filter((t) => now - t < this.opts.windowMs);
    if (list.length) this.failures.set(key, list);
    else this.failures.delete(key);
    return list;
  }

  /** Milliseconds until another attempt is allowed, or 0 if allowed now. */
  retryAfter(ip: string, email: string, now = Date.now()): number {
    let wait = 0;
    for (const [key, max] of this.keys(ip, email)) {
      const list = this.recent(key, now);
      if (list.length >= max) wait = Math.max(wait, list[list.length - max] + this.opts.windowMs - now);
    }
    return wait;
  }

  recordFailure(ip: string, email: string, now = Date.now()): void {
    for (const [key] of this.keys(ip, email)) {
      this.failures.set(key, [...this.recent(key, now), now]);
    }
    if (this.failures.size > 10_000) {
      for (const key of [...this.failures.keys()]) this.recent(key, now);
    }
  }

  /** A successful sign-in clears that account's failures (not the IP's). */
  recordSuccess(ip: string, email: string): void {
    this.failures.delete(this.keys(ip, email)[0][0]);
  }
}

const g = globalThis as typeof globalThis & { __schoolsyncLoginLimiter?: LoginLimiter };
export const loginLimiter: LoginLimiter = (g.__schoolsyncLoginLimiter ??= new LoginLimiter());

/** Client IP as seen behind a proxy such as Render's. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}
