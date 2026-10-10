import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPassword, verifyPassword } from "../src/lib/password.ts";
import { createSessionToken, readSessionToken } from "../src/lib/session.ts";

test("passwords hash and verify", () => {
  const h = hashPassword("correct horse");
  assert.equal(verifyPassword("correct horse", h), true);
  assert.equal(verifyPassword("wrong", h), false);
  assert.equal(verifyPassword("x", "garbage"), false);
});

test("session tokens round-trip and reject tampering and expiry", () => {
  const now = Date.now();
  const token = createSessionToken("u-1", 3, now);
  assert.deepEqual(readSessionToken(token, now), { uid: "u-1", version: 3 });

  const [payload, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ uid: "u-director", exp: now + 1e9 })).toString("base64url");
  assert.equal(readSessionToken(`${forged}.${sig}`, now), null);
  assert.equal(readSessionToken(`${payload}.bad`, now), null);
  assert.equal(readSessionToken(token, now + 8 * 86_400_000), null);
  assert.equal(readSessionToken(undefined), null);
});
