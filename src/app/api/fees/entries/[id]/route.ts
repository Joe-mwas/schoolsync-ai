import { errorResponse, requireApiUser } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { deleteFeeEntry } from "@/lib/fees";
import { OFFICE } from "@/lib/types";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiUser(OFFICE);
    const { id } = await params;
    await mutateDb((db) => deleteFeeEntry(db, id));
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
