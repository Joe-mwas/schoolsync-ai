import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { deleteFactImage, detectImageType, MAX_IMAGE_BYTES, readFactImage, saveFactImage } from "../src/lib/factImages.ts";
import { createFact, deleteFact, extractPictures, factsFor, factsPrompt, MAX_FACTS, pictureRequest, updateFact } from "../src/lib/facts.ts";
import { routeMessage } from "../src/lib/hub.ts";
import { buildImagePayload } from "../src/lib/whatsapp.ts";
import { migrateDatabase } from "../src/lib/migrate.ts";
import { seedDatabase } from "../src/lib/seed.ts";
import type { Database } from "../src/lib/types.ts";

const fresh = () => seedDatabase();
const u = (db: Database, id: string) => db.users.find((x) => x.id === id)!;

test("facts are validated and cleaned", () => {
  const db = fresh();
  const admin = u(db, "u-admin");
  assert.throws(() => createFact(db, admin, { title: "  ", details: "x" }), /short title/);
  assert.throws(() => createFact(db, admin, { title: "Fees", details: "" }), /Write the fact/);
  assert.throws(() => createFact(db, admin, { title: "Fees", details: "x".repeat(2001) }), /under 2000/);
  const f = createFact(db, admin, { topic: "Nonsense", title: "  Lunch  ", details: " Ksh 3,500 per term ", visibleTo: "weird", fromAiLogId: "missing" });
  assert.deepEqual([f.topic, f.title, f.details, f.visibleTo, f.fromAiLogId, f.updatedBy], ["Other", "Lunch", "Ksh 3,500 per term", "everyone", null, "u-admin"]);
  const g = updateFact(db, admin, f.id, { topic: "Meals", title: "Lunch fee", details: "Ksh 4,000 per term", visibleTo: "staff" });
  assert.deepEqual([g.topic, g.title, g.details, g.visibleTo], ["Meals", "Lunch fee", "Ksh 4,000 per term", "staff"]);
  assert.throws(() => updateFact(db, admin, "nope", { title: "a", details: "b" }), /not found/);
});

test("the school can keep a bounded number of facts", () => {
  const db = fresh();
  while (db.facts.length < MAX_FACTS) db.facts.push({ ...db.facts[0], id: `f${db.facts.length}` });
  assert.throws(() => createFact(db, u(db, "u-admin"), { title: "One more", details: "x" }), /up to 300/);
});

test("a fact saved from AI Review closes that answer, and deleting it reopens the link", () => {
  const db = fresh();
  db.aiLogs.push({ id: "log1", channel: "whatsapp", userId: "u-parent1", question: "What is the paybill?", answer: "I am not sure", createdAt: new Date().toISOString(), flagged: true, note: "Paybill is 247247" });
  const f = createFact(db, u(db, "u-admin"), { topic: "Fees and payments", title: "Paybill", details: "247247", fromAiLogId: "log1" });
  const log = db.aiLogs[0];
  assert.equal(f.fromAiLogId, "log1");
  assert.equal(log.factId, f.id);
  assert.ok(log.reviewedAt);
  // Editing keeps the link even if the client sends something else.
  assert.equal(updateFact(db, u(db, "u-admin"), f.id, { title: "Paybill", details: "247247 acc ADM", fromAiLogId: null }).fromAiLogId, "log1");
  deleteFact(db, f.id);
  assert.equal(log.factId, null);
  assert.equal(db.facts.some((x) => x.id === f.id), false);
  assert.throws(() => deleteFact(db, f.id), /not found/);
});

test("staff-only facts never reach parents or learners", () => {
  const db = fresh();
  const staffOnly = (id: string) => factsFor(db, u(db, id)).some((f) => f.visibleTo === "staff");
  assert.equal(staffOnly("u-parent1"), false);
  assert.equal(staffOnly("u-student1"), false);
  assert.equal(staffOnly("u-teacher1"), true);
  assert.equal(staffOnly("u-director"), true);
  assert.equal(staffOnly("u-admin"), true);
  assert.doesNotMatch(factsPrompt(factsFor(db, u(db, "u-parent1"))), /Staff meeting/);
});

test("the AI sees facts grouped by topic in a stable order", () => {
  const db = fresh();
  db.facts = [];
  assert.equal(factsPrompt([]), "");
  const admin = u(db, "u-admin");
  createFact(db, admin, { topic: "Uniform", title: "Shoes", details: "Black" });
  createFact(db, admin, { topic: "Fees and payments", title: "Paybill", details: "247247" });
  createFact(db, admin, { topic: "Uniform", title: "Blazer", details: "Navy" });
  assert.equal(factsPrompt(db.facts), "## Fees and payments\n- Paybill: 247247\n## Uniform\n- Blazer: Navy\n- Shoes: Black");
});

test("older databases gain an empty facts list", () => {
  const db = fresh() as Partial<Database>;
  delete db.facts;
  assert.equal(migrateDatabase(db as Database, {}), true);
  assert.deepEqual(db.facts, []);
});

const withPicture = () => {
  const db = fresh();
  const uniform = db.facts.find((f) => f.id === "fact-uniform")!;
  uniform.image = { file: "u.jpg", type: "image/jpeg", size: 10 };
  const staff = db.facts.find((f) => f.visibleTo === "staff")!;
  staff.image = { file: "s.jpg", type: "image/jpeg", size: 10 };
  return { db, uniform, staff };
};

test("asking for a picture of something sends that fact's picture", () => {
  const { db, uniform, staff } = withPicture();
  const parent = u(db, "u-parent1");
  for (const ask of ["Can I get a picture of the school uniform?", "send photo of uniforms please", "Naomba picha ya sare", "What does the uniform look like?"]) {
    assert.equal(pictureRequest(db, parent, ask)?.id, uniform.id, ask);
  }
  assert.equal(pictureRequest(db, parent, "Tell me about the uniform"), null, "no picture word");
  assert.equal(pictureRequest(db, parent, "send a picture of the bus"), null, "no fact with that picture");
  assert.equal(pictureRequest(db, parent, "picture of the staff meeting"), null, "staff-only picture");
  assert.equal(pictureRequest(db, u(db, "u-teacher1"), "picture of the staff meeting")?.id, staff.id);
  const action = routeMessage(db, parent, "picha ya uniform");
  assert.equal(action.type, "picture");
});

test("the AI can attach pictures it is allowed to send, and the markers never reach the parent", () => {
  const { db, uniform, staff } = withPicture();
  const parent = u(db, "u-parent1");
  assert.match(factsPrompt(factsFor(db, parent), true), new RegExp(`\\[\\[picture:${uniform.id}\\]\\]`));
  assert.doesNotMatch(factsPrompt(factsFor(db, parent)), /picture:/);
  const out = extractPictures(db, parent, `Here is the uniform.\n[[picture:${uniform.id}]]\n[[picture:${staff.id}]] [[picture:fact-hours]] [[picture:${uniform.id}]]`);
  assert.equal(out.text, "Here is the uniform.");
  assert.deepEqual(out.facts.map((f) => f.id), [uniform.id]);
});

test("pictures are checked by content, kept beside the database and removable", async () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
  assert.equal(detectImageType(jpeg), "image/jpeg");
  assert.equal(detectImageType(png), "image/png");
  assert.equal(detectImageType(new TextEncoder().encode("<svg onload=alert(1)>")), null);
  const dir = await mkdtemp(path.join(tmpdir(), "facts-"));
  const dataFile = path.join(dir, "db.json");
  await assert.rejects(saveFactImage(dataFile, new TextEncoder().encode("GIF89a....")), /JPEG or PNG/);
  await assert.rejects(saveFactImage(dataFile, new Uint8Array(MAX_IMAGE_BYTES + 1)), /over 5 MB/);
  const img = await saveFactImage(dataFile, png);
  assert.equal(img.type, "image/png");
  assert.match(img.file, /\.png$/);
  assert.deepEqual(new Uint8Array((await readFactImage(dataFile, img))!), png);
  await assert.rejects(readFactImage(dataFile, { ...img, file: "../db.json" }), /not found/);
  await deleteFactImage(dataFile, img);
  assert.equal(await readFactImage(dataFile, img), null);
});

test("WhatsApp picture messages carry the caption", () => {
  assert.deepEqual(buildImagePayload("+254 700 000004", "MEDIA1", " School uniform: red sweater "), {
    messaging_product: "whatsapp",
    to: "254700000004",
    type: "image",
    image: { id: "MEDIA1", caption: "School uniform: red sweater" },
  });
  assert.equal(buildImagePayload("254700000004", "M", "x".repeat(2000)).image.caption?.length, 1024);
});
