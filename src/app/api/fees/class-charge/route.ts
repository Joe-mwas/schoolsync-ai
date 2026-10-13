import { errorResponse, requireApiUser } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { setClassCharge } from "@/lib/fees";
import { OFFICE } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const user = await requireApiUser(OFFICE);
    const input = (await req.json().catch(() => ({}))) as Parameters<typeof setClassCharge>[2];
    return Response.json(await mutateDb((db) => setClassCharge(db, user, input)));
  } catch (err) {
    return errorResponse(err);
  }
}
