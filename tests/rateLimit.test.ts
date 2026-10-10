import assert from "node:assert/strict";
import { test } from "node:test";
import { LoginLimiter } from "../src/lib/rateLimit.ts";

const MIN = 60_000;

test("locks an account after repeated failures from one IP, then recovers", () => {
  const l = new LoginLimiter({ windowMs: 15 * MIN, maxPerAccount: 5, maxPerIp: 20 });
  const t0 = 1_000_000;
  for (let i = 0; i < 5; i++) {
    assert.equal(l.retryAfter("1.1.1.1", "a@x.org", t0 + i), 0);
    l.recordFailure("1.1.1.1", "A@x.org ", t0 + i);
  }
  const wait = l.retryAfter("1.1.1.1", "a@x.org", t0 + 10);
  assert.ok(wait > 14 * MIN && wait <= 15 * MIN);
  // Other accounts and other IPs are unaffected.
  assert.equal(l.retryAfter("1.1.1.1", "b@x.org", t0 + 10), 0);
  assert.equal(l.retryAfter("2.2.2.2", "a@x.org", t0 + 10), 0);
  // The window slides.
  assert.equal(l.retryAfter("1.1.1.1", "a@x.org", t0 + 15 * MIN + 1), 0);
});

test("limits password spraying across accounts from one IP", () => {
  const l = new LoginLimiter({ windowMs: 15 * MIN, maxPerAccount: 5, maxPerIp: 20 });
  for (let i = 0; i < 20; i++) l.recordFailure("3.3.3.3", `user${i}@x.org`, 0);
  assert.ok(l.retryAfter("3.3.3.3", "fresh@x.org", 1) > 0);
});

test("a successful sign-in clears that account's failures", () => {
  const l = new LoginLimiter({ windowMs: 15 * MIN, maxPerAccount: 2, maxPerIp: 20 });
  l.recordFailure("1.1.1.1", "a@x.org", 0);
  l.recordSuccess("1.1.1.1", "a@x.org");
  l.recordFailure("1.1.1.1", "a@x.org", 1);
  assert.equal(l.retryAfter("1.1.1.1", "a@x.org", 2), 0);
});
