import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { HttpError } from "./errors.ts";
import type { FactImage } from "./types.ts";

/** WhatsApp accepts JPEG and PNG pictures up to 5 MB. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function imageDir(dataFile: string): string {
  return path.join(path.dirname(dataFile), "images");
}

/** Work out the picture type from its first bytes (not the file name). */
export function detectImageType(bytes: Uint8Array): FactImage["type"] | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  return null;
}

export async function saveFactImage(dataFile: string, bytes: Uint8Array): Promise<FactImage> {
  if (bytes.length === 0) throw new HttpError(400, "Choose a picture to upload");
  if (bytes.length > MAX_IMAGE_BYTES) throw new HttpError(400, "That picture is over 5 MB; use a smaller one");
  const type = detectImageType(bytes);
  if (!type) throw new HttpError(400, "Use a JPEG or PNG picture");
  const file = `${crypto.randomUUID()}.${type === "image/png" ? "png" : "jpg"}`;
  await mkdir(imageDir(dataFile), { recursive: true });
  await writeFile(path.join(imageDir(dataFile), file), bytes);
  return { file, type, size: bytes.length };
}

function safePath(dataFile: string, file: string): string {
  if (!/^[\w-]+\.(jpg|png)$/.test(file)) throw new HttpError(404, "Picture not found");
  return path.join(imageDir(dataFile), file);
}

export async function readFactImage(dataFile: string, image: FactImage): Promise<Buffer | null> {
  return readFile(safePath(dataFile, image.file)).catch(() => null);
}

export async function deleteFactImage(dataFile: string, image: FactImage | null | undefined): Promise<void> {
  if (image) await rm(safePath(dataFile, image.file), { force: true }).catch(() => {});
}
