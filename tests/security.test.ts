import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { decodeBackup, listSnapshots, readSnapshot, writeSnapshot } from "../src/lib/backup.ts";
import { decrypt, encrypt, encryptionKey, isEncrypted, seal, unseal } from "../src/lib/dataCrypto.ts";
import { backupDirectory, mutateDb, readDb, resetDbCache } from "../src/lib/db.ts";
import { offsiteConfig, offsiteDue, offsiteObjectName, readOffsiteStatus, signV4, uploadOffsite } from "../src/lib/offsite.ts";
import { seedDatabase } from "../src/lib/seed.ts";

const KEY = "k".repeat(16) + "0123456789abcdefXYZ";
const OTHER = "z".repeat(40);
const tmp = () => mkdtemp(path.join(tmpdir(), "schoolsync-sec-"));

test("data is encrypted with AES-256-GCM and only the right key opens it", () => {
  const env = { DATA_ENCRYPTION_KEY: KEY };
  const sealed = seal(Buffer.from("Brian Kamau owes 5000"), env);
  assert.ok(isEncrypted(sealed));
  assert.ok(!sealed.toString("latin1").includes("Brian"), "nothing readable in the file");
  assert.equal(unseal(sealed, env).toString(), "Brian Kamau owes 5000");
  assert.notDeepEqual(seal(Buffer.from("x"), env), seal(Buffer.from("x"), env), "a fresh random IV every time");
  assert.throws(() => decrypt(sealed, { DATA_ENCRYPTION_KEY: OTHER }), /doesn't match/);
  assert.throws(() => decrypt(sealed, {}), /isn't set/);
  // Rotating the key: the old one still opens old files.
  assert.equal(decrypt(sealed, { DATA_ENCRYPTION_KEY: OTHER, DATA_ENCRYPTION_KEY_PREVIOUS: KEY }).toString(), "Brian Kamau owes 5000");
  // Tampering is detected.
  const bad = Buffer.from(sealed);
  bad[bad.length - 1] ^= 1;
  assert.throws(() => decrypt(bad, env), /couldn't be decrypted/);
  assert.throws(() => encryptionKey({ DATA_ENCRYPTION_KEY: "short" }), /at least 32/);
  assert.equal(encryptionKey({}), null);
  assert.equal(unseal(Buffer.from("plain"), {}).toString(), "plain", "unencrypted data passes through");
  assert.ok(isEncrypted(encrypt(Buffer.from("y"), encryptionKey(env)!)));
});

test("turning encryption on encrypts the data file and existing backups", async () => {
  const dir = await tmp();
  process.env.DATA_FILE = path.join(dir, "db.json");
  delete process.env.DATA_ENCRYPTION_KEY;
  resetDbCache();
  await mutateDb((d) => void (d.events = []));
  const plainBackup = (await listSnapshots(backupDirectory()))[0];
  assert.match(await readFile(process.env.DATA_FILE, "utf8"), /Brian Kamau/, "before: readable");

  process.env.DATA_ENCRYPTION_KEY = KEY;
  resetDbCache();
  assert.ok((await readDb()).users.some((u) => u.name === "Brian Kamau"), "the app still reads it");
  const onDisk = await readFile(process.env.DATA_FILE);
  assert.ok(isEncrypted(onDisk) && !onDisk.toString("latin1").includes("Brian"), "after: encrypted on disk");
  const old = await readSnapshot(backupDirectory(), plainBackup.name);
  assert.ok(isEncrypted(old), "older backups were encrypted too");
  assert.ok(decodeBackup(old).users.length > 0, "and still restore");

  await mutateDb((d) => void (d.posters = []));
  resetDbCache();
  assert.equal((await readDb()).posters.length, 0, "changes are saved encrypted and read back");

  process.env.DATA_ENCRYPTION_KEY = OTHER;
  resetDbCache();
  await assert.rejects(readDb(), /doesn't match/, "a wrong key never silently starts an empty school");
  assert.throws(() => decodeBackup(old), /doesn't match/);
  delete process.env.DATA_ENCRYPTION_KEY;
  resetDbCache();
});

test("new snapshots are encrypted when a key is set", async () => {
  const dir = await tmp();
  process.env.DATA_ENCRYPTION_KEY = KEY;
  const snap = await writeSnapshot(dir, seedDatabase(), "manual");
  const raw = await readSnapshot(dir, snap.name);
  assert.ok(isEncrypted(raw));
  assert.equal(decodeBackup(raw).users.length, seedDatabase().users.length);
  delete process.env.DATA_ENCRYPTION_KEY;
});

test("Signature V4 matches AWS's published example", () => {
  // From the AWS S3 docs ("Example: GET Object").
  const auth = signV4({
    method: "GET",
    path: "/test.txt",
    headers: {
      host: "examplebucket.s3.amazonaws.com",
      range: "bytes=0-9",
      "x-amz-content-sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "x-amz-date": "20130524T000000Z",
    },
    region: "us-east-1",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  });
  assert.equal(
    auth,
    "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
  );
});

test("off-site upload: encrypted, signed, and its outcome recorded", async () => {
  const received: { method?: string; url?: string; auth?: string; body: Buffer }[] = [];
  let reply = 200;
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      received.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: Buffer.concat(chunks) });
      res.statusCode = reply;
      res.end(reply === 200 ? "" : "<Error><Code>SignatureDoesNotMatch</Code></Error>");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const dir = await tmp();
  const env = {
    OFFSITE_BACKUP_ENDPOINT: `http://127.0.0.1:${port}/`,
    OFFSITE_BACKUP_BUCKET: "school-backups",
    OFFSITE_BACKUP_ACCESS_KEY_ID: "AKID",
    OFFSITE_BACKUP_SECRET_ACCESS_KEY: "secret",
    DATA_ENCRYPTION_KEY: KEY,
  };
  try {
    const now = new Date("2026-10-22T01:30:00Z");
    await assert.rejects(uploadOffsite(seedDatabase(), dir, { ...env, DATA_ENCRYPTION_KEY: "" }, now), /only ever uploaded encrypted/);
    const s = await uploadOffsite(seedDatabase(), dir, env, now);
    assert.equal(s.lastObject, "schoolsync/2026-10-22.json.gz.enc");
    assert.equal(received[0].method, "PUT");
    assert.equal(received[0].url, "/school-backups/schoolsync/2026-10-22.json.gz.enc");
    assert.match(received[0].auth!, /^AWS4-HMAC-SHA256 Credential=AKID\/20261022\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
    assert.ok(isEncrypted(received[0].body) && !received[0].body.toString("latin1").includes("Kamau"), "only ciphertext leaves the server");
    assert.ok(decodeBackup(unseal(received[0].body, env)).users.length > 0, "and it restores with the key");
    assert.equal((await readOffsiteStatus(dir)).lastSuccessAt, now.toISOString());

    reply = 403;
    await assert.rejects(uploadOffsite(seedDatabase(), dir, env, new Date("2026-10-23T01:30:00Z")), /rejected the access key/);
    const after = await readOffsiteStatus(dir);
    assert.equal(after.lastSuccessAt, now.toISOString(), "a failure keeps the last good time");
    assert.match(after.lastError!, /SignatureDoesNotMatch/);
  } finally {
    server.close();
  }
});

test("off-site settings and the daily schedule", () => {
  assert.equal(offsiteConfig({}), null);
  assert.deepEqual(offsiteConfig({ OFFSITE_BACKUP_ENDPOINT: "https://x.r2.cloudflarestorage.com/", OFFSITE_BACKUP_BUCKET: "b", OFFSITE_BACKUP_ACCESS_KEY_ID: "a", OFFSITE_BACKUP_SECRET_ACCESS_KEY: "s", OFFSITE_BACKUP_PREFIX: "/st-thomas/" }), {
    endpoint: "https://x.r2.cloudflarestorage.com", bucket: "b", accessKeyId: "a", secretAccessKey: "s", region: "auto", prefix: "st-thomas",
  });
  assert.equal(offsiteObjectName("p", new Date("2026-01-02T23:00:00Z")), "p/2026-01-02.json.gz.enc");
  const now = Date.parse("2026-10-22T12:00:00Z");
  const st = (lastSuccessAt: string | null, lastAttemptAt: string | null = lastSuccessAt, lastError: string | null = null) => ({ lastSuccessAt, lastAttemptAt, lastError, lastObject: null, bytes: 0 });
  assert.equal(offsiteDue(st(null), now), true);
  assert.equal(offsiteDue(st("2026-10-22T02:00:00Z"), now), false);
  assert.equal(offsiteDue(st("2026-10-21T12:00:00Z"), now), true);
  assert.equal(offsiteDue(st("2026-10-20T12:00:00Z", "2026-10-22T11:30:00Z", "boom"), now), false, "a failure waits an hour before retrying");
  assert.equal(offsiteDue(st("2026-10-20T12:00:00Z", "2026-10-22T10:30:00Z", "boom"), now), true);
});

test("a plain-text backup file still restores (from before encryption)", async () => {
  const dir = await tmp();
  const f = path.join(dir, "old.json");
  await writeFile(f, JSON.stringify(seedDatabase()));
  assert.ok(decodeBackup(await readFile(f)).users.length > 0);
});
