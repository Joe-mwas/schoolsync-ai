import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";
import { schoolName } from "../src/lib/ai.ts";
import { isEncrypted } from "../src/lib/dataCrypto.ts";
import { attachmentHeader, documentKind, documentsDir, readDocumentFile, removeDocument, saveDocumentFile } from "../src/lib/documents.ts";
import { HttpError } from "../src/lib/errors.ts";
import { importDate, importFees } from "../src/lib/fees.ts";
import { runImport } from "../src/lib/importer.ts";
import { migrateDatabase } from "../src/lib/migrate.ts";
import { cleanWebsite, rememberProfileName, updateProfile } from "../src/lib/schoolProfile.ts";
import { seedDatabase } from "../src/lib/seed.ts";
import type { Database } from "../src/lib/types.ts";
import { readXlsxRows, xlsxToCsv } from "../src/lib/xlsx.ts";

const fixture = (name: string) => readFile(path.join(import.meta.dirname, "fixtures", name));

test("school details: validated, and the name is used everywhere", () => {
  const db = seedDatabase();
  assert.throws(() => updateProfile(db, { name: " " }), /school's name/);
  assert.throws(() => updateProfile(db, { name: "X", email: "not-an-email" }), /email/);
  assert.throws(() => updateProfile(db, { name: "X", website: "javascript:alert(1)" }), /website/);
  const p = updateProfile(db, { name: "  St. Thomas   Catholic Academy ", website: "stthomas.ac.ke", phone: "0712 345 678", email: "info@stthomas.ac.ke" });
  assert.equal(p.name, "St. Thomas Catholic Academy");
  assert.equal(p.website, "https://stthomas.ac.ke");
  assert.equal(cleanWebsite("http://school.ac.ke/about/"), "http://school.ac.ke/about");
  rememberProfileName(db);
  assert.equal(schoolName({ SCHOOL_NAME: "Old name" }), "St. Thomas Catholic Academy", "Setup's name wins over SCHOOL_NAME");
  rememberProfileName(null);
  assert.equal(schoolName({ SCHOOL_NAME: "Old name" }), "Old name");
});

test("older data gets an empty profile and document list", () => {
  const db = seedDatabase() as Partial<Database>;
  delete db.profile;
  delete db.documents;
  assert.equal(migrateDatabase(db as Database, {}), true);
  assert.equal(db.profile!.name, "");
  assert.deepEqual(db.documents, []);
});

test("documents: only real office files, stored encrypted, downloaded safely", async () => {
  assert.equal(documentKind(Buffer.from("%PDF-1.7 ..."), "a.pdf"), "PDF");
  assert.equal(documentKind(Buffer.from([0x50, 0x4b, 3, 4, 0]), "list.xlsx"), "Excel");
  assert.equal(documentKind(Buffer.from([0x50, 0x4b, 3, 4, 0]), "evil.html"), null, "a zip pretending to be something else");
  assert.equal(documentKind(Buffer.from("<script>alert(1)</script>"), "page.html"), null);
  assert.equal(documentKind(Buffer.from("name,class\n"), "list.csv"), "CSV");
  assert.equal(documentKind(Buffer.from([0x4d, 0x5a, 0, 0]), "virus.exe"), null);

  const dataFile = path.join(await mkdtemp(path.join(tmpdir(), "schoolsync-docs-")), "db.json");
  const db = seedDatabase();
  const actor = db.users.find((u) => u.role === "admin")!;
  process.env.DATA_ENCRYPTION_KEY = "k".repeat(40);
  try {
    const pdf = Buffer.from("%PDF-1.4 Director's instructions for Term 3");
    const doc = await saveDocumentFile(dataFile, pdf, "../../Term 3 instructions.pdf", { category: "instructions", note: "From the director" }, actor);
    assert.equal(doc.fileName, "Term 3 instructions.pdf", "no folder tricks in the name");
    assert.equal(doc.title, "Term 3 instructions");
    assert.equal(doc.kind, "PDF");
    const stored = await readFile(path.join(documentsDir(dataFile), doc.storedAs));
    assert.ok(isEncrypted(stored) && !stored.toString("latin1").includes("Director"), "encrypted on disk");
    assert.deepEqual(await readDocumentFile(dataFile, doc), pdf);
    await assert.rejects(readDocumentFile(dataFile, { ...doc, storedAs: "../db.json" }), (e: unknown) => e instanceof HttpError && e.status === 404);
    await assert.rejects(saveDocumentFile(dataFile, Buffer.from("MZ"), "x.exe", {}, actor), /isn't accepted/);
    await assert.rejects(saveDocumentFile(dataFile, Buffer.alloc(0), "x.pdf", {}, actor), /Choose a file/);
    db.documents.push(doc);
    assert.equal(removeDocument(db, doc.id).id, doc.id);
    assert.throws(() => removeDocument(db, doc.id), /not found/);
    assert.equal((await readdir(documentsDir(dataFile))).filter((n) => n.endsWith(".tmp")).length, 0);
  } finally {
    delete process.env.DATA_ENCRYPTION_KEY;
  }
  assert.equal(attachmentHeader('Ratiba "Muhula" 3.pdf'), `attachment; filename="Ratiba _Muhula_ 3.pdf"; filename*=UTF-8''Ratiba%20%22Muhula%22%203.pdf`);
});

test("Excel files from Excel-style tools read as CSV", async () => {
  const rows = readXlsxRows(await fixture("class-list-openpyxl.xlsx"));
  assert.deepEqual(rows[0], ["Student name", "Class", "Admission number", "Parent name", "Parent phone", "Date"]);
  assert.deepEqual(rows[2], ["Faith, Njeri", "Grade 8 West", "ADM/1002", 'Ann "Mama" Njeri', "", ""], "commas, quotes and blanks kept");
  assert.equal(rows[4][3], "Peter <Wanjiru>");
  assert.equal(rows[1][5], "46067", "dates arrive as Excel day numbers");
  assert.equal(importDate("46067"), "2026-02-14");
  const csv = xlsxToCsv(await fixture("class-list-openpyxl.xlsx"));
  assert.match(csv, /^Student name,Class,/);
  assert.match(csv, /"Faith, Njeri",Grade 8 West,ADM\/1002,"Ann ""Mama"" Njeri",,/);

  // The whole class-list import works straight from the Excel file.
  const db = seedDatabase();
  const report = runImport(db, csv, { newId: (p) => `${p}-${Math.random().toString(36).slice(2, 8)}`, credentials: () => "dry-run" });
  assert.deepEqual(report.rows.filter((r) => r.error).map((r) => [r.student, r.error]), [["Faith, Njeri", "Parent needs a phone number or email"]], "only the row with no parent contact is refused");
  assert.ok(db.users.some((u) => u.name === "Mercy Wanjiru & Co"));

  // A LibreOffice-made fees sheet imports too.
  const fees = xlsxToCsv(await fixture("fees-libreoffice.xlsx"));
  const r = importFees(seedDatabase(), seedDatabase().users.find((u) => u.role === "admin")!, fees);
  assert.equal(r.errors, 0);
  assert.equal(r.updated, 2);
});

test("Excel reader refuses old .xls files, junk and zip bombs", () => {
  assert.throws(() => readXlsxRows(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])), /old-style Excel/);
  assert.throws(() => readXlsxRows(Buffer.from("name,class\n")), /isn't an Excel/);
  // A tiny zip whose one sheet would unpack to far more than the limit.
  const huge = deflateRawSync(Buffer.alloc(80 * 1024 * 1024, 0x20));
  const name = Buffer.from("xl/worksheets/sheet1.xml");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(huge.length, 18); local.writeUInt32LE(100, 22); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(huge.length, 20); central.writeUInt32LE(100, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(0, 42);
  const cdOffset = local.length + name.length + huge.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(cdOffset, 16);
  const zip = Buffer.concat([local, name, huge, central, name, end]);
  assert.throws(() => readXlsxRows(zip), /too large|damaged/);
});
