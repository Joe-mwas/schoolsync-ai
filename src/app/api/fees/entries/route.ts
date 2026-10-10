import { errorResponse, requireApiUser } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { addFeeEntry, type EntryInput } from "@/lib/fees";
import { LEADERS } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const user = await requireApiUser(LEADERS);
    const input = (await req.json().catch(() => ({}))) as EntryInput;
    const entry = await mutateDb((db) => addFeeEntry(db, user, input));
    return Response.json({ entry }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
