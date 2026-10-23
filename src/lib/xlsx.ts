import { inflateRawSync } from "node:zlib";
import { HttpError } from "./errors.ts";

/**
 * Read the first sheet of an Excel (.xlsx) file as CSV, so every upload that
 * takes a CSV also takes the spreadsheet a school already has. An .xlsx file
 * is a zip of XML parts; only the parts needed for cell values are read.
 * Old .xls files (a different, binary format) aren't supported.
 */

export const MAX_XLSX_BYTES = 5 * 1024 * 1024;
const MAX_UNZIPPED_BYTES = 60 * 1024 * 1024;

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  offset: number;
}

const bad = (why = "That file isn't an Excel (.xlsx) spreadsheet") => new HttpError(400, why);

function zipEntries(buf: Buffer): ZipEntry[] {
  // The end-of-central-directory record sits in the last 64 KB.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw bad();
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (count > 2000) throw bad("That spreadsheet has too many parts");
  const out: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw bad();
    const nameLen = buf.readUInt16LE(p + 28);
    out.push({
      method: buf.readUInt16LE(p + 10),
      compressedSize: buf.readUInt32LE(p + 20),
      size: buf.readUInt32LE(p + 24),
      offset: buf.readUInt32LE(p + 42),
      name: buf.toString("utf8", p + 46, p + 46 + nameLen),
    });
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return out;
}

function unzip(buf: Buffer, entry: ZipEntry, budget: { left: number }): string {
  const h = entry.offset;
  if (h + 30 > buf.length || buf.readUInt32LE(h) !== 0x04034b50) throw bad();
  const start = h + 30 + buf.readUInt16LE(h + 26) + buf.readUInt16LE(h + 28);
  const data = buf.subarray(start, start + entry.compressedSize);
  if (entry.size > budget.left) throw bad("That spreadsheet is too large");
  let out: Buffer;
  if (entry.method === 0) out = Buffer.from(data);
  else if (entry.method === 8) {
    try {
      out = inflateRawSync(data, { maxOutputLength: Math.max(1, budget.left) });
    } catch {
      throw bad("That spreadsheet is damaged or too large");
    }
  } else throw bad();
  budget.left -= out.length;
  return out.toString("utf8");
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** All the text runs of a shared string or inline string, joined. */
const runs = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join("");

function colIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? "";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function csvField(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** The first sheet's cells, row by row. */
export function readXlsxRows(file: Uint8Array): string[][] {
  const buf = Buffer.from(file);
  if (buf.length > MAX_XLSX_BYTES) throw bad("That spreadsheet is over 5 MB; save a smaller copy");
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0xd0cf11e0) {
    throw bad('That is an old-style Excel file (.xls). In Excel choose File → Save As → "Excel Workbook (.xlsx)" or "CSV UTF-8", then upload it again.');
  }
  if (buf.length < 4 || buf.readUInt32LE(0) !== 0x04034b50) throw bad();
  const entries = new Map(zipEntries(buf).map((e) => [e.name.replace(/^\/+/, ""), e]));
  const budget = { left: MAX_UNZIPPED_BYTES };
  const part = (name: string) => {
    const e = entries.get(name);
    return e ? unzip(buf, e, budget) : null;
  };

  // The first sheet in the workbook's own order.
  let sheetPath = "xl/worksheets/sheet1.xml";
  const workbook = part("xl/workbook.xml");
  const rels = part("xl/_rels/workbook.xml.rels");
  const firstId = workbook ? /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook)?.[1] : undefined;
  if (firstId && rels) {
    const target = new RegExp(`<Relationship\\b[^>]*\\bId="${firstId.replace(/[^\w-]/g, "")}"[^>]*\\bTarget="([^"]+)"`).exec(rels)?.[1]
      ?? new RegExp(`<Relationship\\b[^>]*\\bTarget="([^"]+)"[^>]*\\bId="${firstId.replace(/[^\w-]/g, "")}"`).exec(rels)?.[1];
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  }
  const sheet = part(sheetPath);
  if (!sheet) throw bad();
  const sharedXml = part("xl/sharedStrings.xml");
  const shared = sharedXml ? [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => runs(m[1])) : [];

  const rows: string[][] = [];
  for (const rowMatch of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowNum = Number(/\br="(\d+)"/.exec(rowMatch[1])?.[1] ?? rows.length + 1);
    const cells: string[] = [];
    let next = 0;
    for (const c of (rowMatch[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const ref = /\br="([A-Z]+\d+)"/i.exec(attrs)?.[1];
      const col = ref ? colIndex(ref) : next;
      next = col + 1;
      if (col > 1000) continue;
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      const body = c[2] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = "";
      if (type === "s") value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = runs(body);
      else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
      else if (v !== undefined) value = decode(v);
      cells[col] = value;
    }
    while (rows.length < rowNum - 1 && rows.length < 50_000) rows.push([]);
    rows.push(Array.from(cells, (x) => x ?? ""));
    if (rows.length > 50_000) throw bad("That spreadsheet has too many rows");
  }
  // Drop empty rows at the end and empty columns on the right.
  while (rows.length && rows[rows.length - 1].every((x) => !x.trim())) rows.pop();
  const width = Math.max(0, ...rows.map((r) => r.reduce((w, x, i) => (x.trim() ? i + 1 : w), 0)));
  return rows.map((r) => Array.from({ length: width }, (_, i) => (r[i] ?? "").trim()));
}

export function xlsxToCsv(file: Uint8Array): string {
  const rows = readXlsxRows(file);
  if (rows.length === 0) throw bad("That spreadsheet's first sheet is empty");
  return rows.map((r) => r.map(csvField).join(",")).join("\n") + "\n";
}
