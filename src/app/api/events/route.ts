import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { mutateDb, newId } from "@/lib/db";
import type { SchoolEvent } from "@/lib/types";

export async function POST(req: Request) {
  try {
    await requireApiUser(["director"]);
    const input = (await req.json().catch(() => ({}))) as Partial<SchoolEvent>;
    const title = input.title?.trim();
    const date = input.date?.trim();
    if (!title || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, "Title and a YYYY-MM-DD date are required");
    const event: SchoolEvent = { id: newId("e"), title, date, description: input.description?.trim() ?? "" };
    await mutateDb((db) => void db.events.push(event));
    return Response.json({ event }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
