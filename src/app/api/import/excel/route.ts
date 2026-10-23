import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { STAFF } from "@/lib/types";
import { MAX_XLSX_BYTES, xlsxToCsv } from "@/lib/xlsx";

/** POST an .xlsx file (the raw bytes) → { csv } of its first sheet, for the CSV uploads to preview and import. */
export async function POST(req: Request) {
  try {
    await requireApiUser(STAFF);
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length === 0) throw new HttpError(400, "Choose a spreadsheet");
    if (bytes.length > MAX_XLSX_BYTES) throw new HttpError(400, "That spreadsheet is over 5 MB; save a smaller copy");
    return Response.json({ csv: xlsxToCsv(bytes) });
  } catch (err) {
    return errorResponse(err);
  }
}
