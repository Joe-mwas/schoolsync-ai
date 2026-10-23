import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { seal, unseal } from "./dataCrypto.ts";
import { HttpError } from "./errors.ts";
import { DOCUMENT_CATEGORIES, type Database, type DocumentCategory, type SchoolDocument, type User } from "./types.ts";

/**
 * Files a school hands over during onboarding: the director's instructions,
 * policies, student lists, fee structures. Kept in a "documents" folder next
 * to the data, encrypted like the data when DATA_ENCRYPTION_KEY is set, and
 * only ever downloaded (never shown inline), so a file can't run in the app.
 */

export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

export function documentsDir(dataFile: string): string {
  return path.join(path.dirname(dataFile), "documents");
}

const startsWith = (b: Uint8Array, sig: number[]) => b.length >= sig.length && sig.every((x, i) => b[i] === x);

/** What kind of file this is, judged by its contents and name; null when it isn't one we accept. */
export function documentKind(bytes: Uint8Array, fileName: string): string | null {
  const ext = path.extname(fileName).toLowerCase();
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return "PDF";
  if (startsWith(bytes, [0xff, 0xd8, 0xff]) || startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "Picture";
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    return ({ ".docx": "Word", ".xlsx": "Excel", ".pptx": "PowerPoint", ".odt": "Document", ".ods": "Spreadsheet" } as Record<string, string>)[ext] ?? null;
  }
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) {
    return ({ ".doc": "Word", ".xls": "Excel", ".ppt": "PowerPoint" } as Record<string, string>)[ext] ?? null;
  }
  if ((ext === ".csv" || ext === ".txt") && !bytes.subarray(0, 8192).includes(0)) return ext === ".csv" ? "CSV" : "Text";
  return null;
}

const ACCEPTED = "PDF, Word, Excel, PowerPoint, CSV, text, or a JPEG/PNG picture";

export interface DocumentInput {
  title?: unknown;
  category?: unknown;
  note?: unknown;
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

/** Check and store the file; the caller records the returned document in the data. */
export async function saveDocumentFile(dataFile: string, bytes: Uint8Array, fileName: string, input: DocumentInput, actor: User): Promise<SchoolDocument> {
  if (bytes.length === 0) throw new HttpError(400, "Choose a file to upload");
  if (bytes.length > MAX_DOCUMENT_BYTES) throw new HttpError(400, "That file is over 15 MB; upload a smaller copy");
  const cleanName = path.basename(fileName || "document").replace(/[^\w.\- ()]/g, "_").slice(0, 120) || "document";
  const kind = documentKind(bytes, cleanName);
  if (!kind) throw new HttpError(400, `That file type isn't accepted. Upload a ${ACCEPTED}.`);
  const category = typeof input.category === "string" && input.category in DOCUMENT_CATEGORIES ? (input.category as DocumentCategory) : "other";
  const storedAs = `${crypto.randomUUID()}.bin`;
  const dir = documentsDir(dataFile);
  await mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `${storedAs}.tmp`);
  await writeFile(tmp, seal(Buffer.from(bytes)));
  await rename(tmp, path.join(dir, storedAs));
  return {
    id: `doc-${crypto.randomUUID().slice(0, 8)}`,
    title: text(input.title, 120) || cleanName.replace(/\.[^.]+$/, ""),
    category,
    fileName: cleanName,
    kind,
    size: bytes.length,
    storedAs,
    note: text(input.note, 300),
    uploadedBy: actor.id,
    uploadedAt: new Date().toISOString(),
  };
}

function storedPath(dataFile: string, doc: Pick<SchoolDocument, "storedAs">): string {
  if (!/^[0-9a-f-]+\.bin$/.test(doc.storedAs)) throw new HttpError(404, "Document not found");
  return path.join(documentsDir(dataFile), doc.storedAs);
}

export async function readDocumentFile(dataFile: string, doc: SchoolDocument): Promise<Buffer> {
  const raw = await readFile(storedPath(dataFile, doc)).catch(() => null);
  if (!raw) throw new HttpError(404, "That file is missing from the server");
  return unseal(raw);
}

export async function deleteDocumentFile(dataFile: string, doc: SchoolDocument): Promise<void> {
  await rm(storedPath(dataFile, doc), { force: true }).catch(() => {});
}

export function removeDocument(db: Database, id: string): SchoolDocument {
  const i = db.documents.findIndex((d) => d.id === id);
  if (i === -1) throw new HttpError(404, "Document not found");
  return db.documents.splice(i, 1)[0];
}

/** "filename.pdf" safe for a Content-Disposition header, keeping non-English names readable. */
export function attachmentHeader(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
