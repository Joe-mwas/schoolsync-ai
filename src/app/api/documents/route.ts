import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { dataFile, mutateDb } from "@/lib/db";
import { deleteDocumentFile, MAX_DOCUMENT_BYTES, saveDocumentFile } from "@/lib/documents";
import { ADMINS } from "@/lib/types";

/** POST a form with file, title, category and note to keep one of the school's documents. */
export async function POST(req: Request) {
  try {
    const actor = await requireApiUser(ADMINS);
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Choose a file to upload");
    if (file.size > MAX_DOCUMENT_BYTES) throw new HttpError(400, "That file is over 15 MB; upload a smaller copy");
    const doc = await saveDocumentFile(dataFile(), new Uint8Array(await file.arrayBuffer()), file.name, {
      title: form?.get("title"),
      category: form?.get("category"),
      note: form?.get("note"),
    }, actor);
    try {
      await mutateDb((db) => void db.documents.push(doc));
    } catch (err) {
      await deleteDocumentFile(dataFile(), doc);
      throw err;
    }
    return Response.json({ document: doc }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
