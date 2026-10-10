import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { mutateDb, readDb, resetDbCache } from "../src/lib/db.ts";

test("seeds on first read and serializes concurrent mutations", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "schoolsync-"));
  process.env.DATA_FILE = path.join(dir, "db.json");
  resetDbCache();

  const db = await readDb();
  assert.ok(db.users.length > 0);
  const before = db.events.length;

  await Promise.all(
    Array.from({ length: 25 }, (_, i) =>
      mutateDb(async (d) => {
        const n = d.events.length;
        await new Promise((r) => setTimeout(r, Math.random() * 3));
        d.events[n] = { id: `e-${i}`, title: `Event ${i}`, date: "2026-01-01", description: "" };
      }),
    ),
  );

  const onDisk = JSON.parse(await readFile(process.env.DATA_FILE, "utf8"));
  assert.equal(onDisk.events.length, before + 25);

  // A failed mutation doesn't block later ones.
  await assert.rejects(mutateDb(() => { throw new Error("boom"); }));
  await mutateDb((d) => void d.events.pop());
  assert.equal((await readDb()).events.length, before + 24);
});

test("production first run creates only the configured director", async () => {
  const { initialDatabase } = await import("../src/lib/seed.ts");
  const { verifyPassword } = await import("../src/lib/password.ts");
  assert.throws(() => initialDatabase({ NODE_ENV: "production" }), /ADMIN_EMAIL/);
  assert.throws(() => initialDatabase({ NODE_ENV: "production", ADMIN_EMAIL: "a@b.c", ADMIN_PASSWORD: "short" }), /ADMIN_EMAIL/);

  const db = initialDatabase({ NODE_ENV: "production", ADMIN_EMAIL: " Head@School.org ", ADMIN_PASSWORD: "long-enough-pw" });
  assert.equal(db.users.length, 1);
  assert.equal(db.users[0].email, "head@school.org");
  assert.equal(db.users[0].role, "director");
  assert.ok(verifyPassword("long-enough-pw", db.users[0].passwordHash));
  assert.equal(db.announcements.length, 0);

  assert.ok(initialDatabase({ NODE_ENV: "production", SEED_DEMO: "1" }).users.length > 1);
});

test("a mutation that throws partway leaves no trace", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "schoolsync-"));
  process.env.DATA_FILE = path.join(dir, "db.json");
  resetDbCache();
  const before = (await readDb()).users[0].name;
  await assert.rejects(
    mutateDb((d) => {
      d.users[0].name = "Half-applied";
      throw new Error("validation failed");
    }),
  );
  await mutateDb(() => undefined);
  assert.equal((await readDb()).users[0].name, before);
  const onDisk = JSON.parse(await readFile(process.env.DATA_FILE, "utf8"));
  assert.equal(onDisk.users[0].name, before);
});
