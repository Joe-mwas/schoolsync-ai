import { errorResponse, requireApiUser } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { createFact, type FactInput } from "@/lib/facts";
import { OFFICE } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const user = await requireApiUser(OFFICE);
    const input = (await req.json().catch(() => ({}))) as FactInput;
    const fact = await mutateDb((db) => createFact(db, user, input));
    return Response.json({ fact }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
