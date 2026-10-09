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
