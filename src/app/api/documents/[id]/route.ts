import { logActivity } from "@/lib/activity";
import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { dataFile, mutateDb, readDb } from "@/lib/db";
import { attachmentHeader, deleteDocumentFile, readDocumentFile, removeDocument } from "@/lib/documents";
import { ADMINS } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/** Download a document. Always as a download, never shown inside the app. */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const me = await requireApiUser(ADMINS);
    const { id } = await params;
    const doc = (await readDb()).documents.find((d) => d.id === id);
    if (!doc) throw new HttpError(404, "Document not found");
    const bytes = await readDocumentFile(dataFile(), doc);
    await logActivity(req, me, "data", "Downloaded a document", doc.title);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": attachmentHeader(doc.fileName),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const me = await requireApiUser(ADMINS);
    const { id } = await params;
    const doc = await mutateDb((db) => removeDocument(db, id));
    await deleteDocumentFile(dataFile(), doc);
    await logActivity(req, me, "data", "Deleted a document", doc.title);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
