import assert from "node:assert/strict";
import { test } from "node:test";
import { mapColumns, parseCsv, runImport, type ImportOptions } from "../src/lib/importer.ts";
import { credentialsCsv, TEMPLATE_CSV } from "../src/lib/importFormat.ts";
import { canonicalPhone } from "../src/lib/phone.ts";
import { seedDatabase } from "../src/lib/seed.ts";
import { findBySignInName } from "../src/lib/users.ts";

process.env.DEFAULT_COUNTRY_CODE = "254";

let n = 0;
const opts = (): ImportOptions & { issued: number } => {
  const o = {
    issued: 0,
    newId: (p: string) => `${p}-imp${++n}`,
    credentials: () => {
      o.issued++;
      return { password: `temp-pass-${o.issued}`, hash: "x:y" };
    },
  };
  return o;
};

test("parses quoted fields, CRLF, BOM and semicolon-delimited files", () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n'), [["a", "b"], ["x, y", 'say "hi"']]);
  assert.deepEqual(parseCsv("Name;Class\nAmy;G1\n"), [["Name", "Class"], ["Amy", "G1"]]);
  assert.deepEqual(parseCsv('a,b\n"multi\nline",2'), [["a", "b"], ["multi\nline", "2"]]);
});

test("matches common column names and requires student + class", () => {
  const m = mapColumns(["Learner Name", "Grade", "Guardian", "WhatsApp", "Email"]);
  assert.deepEqual([m.studentName, m.className, m.parentName, m.parentPhone, m.parentEmail, m.studentEmail], [0, 1, 2, 3, 4, -1]);
  assert.throws(() => mapColumns(["Name", "Phone"]), /Class/);
});

test("phones are stored internationally and local numbers match", () => {
  assert.equal(canonicalPhone("0712 345 678", "254"), "+254712345678");
  assert.equal(canonicalPhone("+254 712-345-678", "254"), "+254712345678");
  assert.equal(canonicalPhone("00254712345678", "254"), "+254712345678");
  assert.equal(canonicalPhone("call me", "254"), null);
});

test("template imports: new classes, siblings share a parent, credentials issued", () => {
  const db = seedDatabase();
  const o = opts();
  const r = runImport(db, TEMPLATE_CSV, o);
  // Brian (Grade 7 East) and Faith (Grade 8 West) already exist in the demo school;
  // Mercy is new. Both parents' numbers are new; Mercy is linked to James.
  assert.deepEqual(r.summary, { rows: 3, newStudents: 1, newParents: 2, newClasses: 1, linkedParents: 1, unchanged: 0, errors: 0 });
  const james = findBySignInName(db, "0712345678")!;
  assert.equal(james.role, "parent");
  assert.equal(james.phone, "+254712345678");
  assert.equal(james.mustChangePassword, true);
  assert.equal(james.childIds.length, 2, "Brian and Mercy share one parent account");
  assert.ok(db.classes.some((c) => c.name === "Grade 5 North"));

  // Credentials for the two new parents only: Mercy has no email, so no password.
  assert.equal(o.issued, 2);
  const jamesCred = r.credentials.find((c) => c.name === "James Kamau")!;
  assert.equal(jamesCred.signIn, "+254712345678");
  assert.equal(jamesCred.note, "Brian Kamau, Mercy Kamau");
  assert.equal(findBySignInName(db, "ann@example.com")?.name, "Ann Njeri");
  assert.equal(r.credentials.find((c) => c.name === "Ann Njeri")!.signIn, "+254722000111");
});

test("re-importing the same file changes nothing", () => {
  const db = seedDatabase();
  runImport(db, TEMPLATE_CSV, opts());
  const users = db.users.length;
  const r = runImport(db, TEMPLATE_CSV, opts());
  assert.equal(r.summary.unchanged, 3);
  assert.equal(r.summary.newStudents + r.summary.newParents + r.summary.newClasses + r.summary.linkedParents, 0);
  assert.equal(db.users.length, users);
});

test("bad rows are reported and leave nothing behind; good rows still import", () => {
  const db = seedDatabase();
  const before = { users: db.users.length, classes: db.classes.length };
  const csv = [
    "Student,Class,Parent,Phone",
    "Zed One,New Class A,Zed Parent,not-a-phone", // invalid phone: student + class must be rolled back
    ",Grade 7 East,,", // missing name
    "Amy Two,Grade 7 East,Peter Otieno,+254700000002", // phone belongs to a teacher
    "Kim Three,Grade 7 East,Ann Njeri,+254700000005", // existing parent: link
    "Lee Four,Grade 7 East,Someone,", // parent without contact
  ].join("\n");
  const r = runImport(db, csv, opts());
  assert.deepEqual(r.rows.map((x) => x.error === null), [false, false, false, true, false]);
  assert.match(r.rows[0].error!, /Phone/);
  assert.match(r.rows[2].error!, /isn't a parent/);
  assert.match(r.rows[4].error!, /phone number or email/);
  assert.equal(db.classes.length, before.classes, "rolled-back row's new class is gone");
  assert.equal(db.users.length, before.users + 1, "only Kim was added");
  assert.deepEqual(r.summary, { rows: 5, newStudents: 1, newParents: 0, newClasses: 0, linkedParents: 1, unchanged: 0, errors: 4 });
  assert.ok(db.users.find((u) => u.id === "u-parent2")!.childIds.some((id) => db.users.find((u) => u.id === id)?.name === "Kim Three"));
});

test("rejects empty and oversized files", () => {
  const db = seedDatabase();
  assert.throws(() => runImport(db, "Student,Class\n", opts()), /no rows/);
  const big = ["Student,Class", ...Array.from({ length: 2001 }, (_, i) => `S${i},C`)].join("\n");
  assert.throws(() => runImport(db, big, opts()), /at most/);
});

test("credentials CSV escapes values and neutralises formulas", () => {
  const out = credentialsCsv([
    { name: "=HYPERLINK(1)", role: "parent", signIn: "+254712345678", temporaryPassword: "abcd-efgh", note: 'A, "B"' },
  ]);
  assert.ok(out.startsWith("﻿Name,Role"));
  assert.ok(out.includes("'=HYPERLINK(1),parent,+254712345678,abcd-efgh,\"A, \"\"B\"\"\""));
});
