import { errorResponse, requireApiUser } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { addFeeEntry, type EntryInput } from "@/lib/fees";
import { OFFICE } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const user = await requireApiUser(OFFICE);
    const input = (await req.json().catch(() => ({}))) as EntryInput;
    const entry = await mutateDb((db) => addFeeEntry(db, user, input));
    return Response.json({ entry }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
