import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { mutateDb, newId, readDb } from "@/lib/db";
import type { Poster, PosterDesign } from "@/lib/types";

const FIELDS: (keyof PosterDesign)[] = ["template", "title", "subtitle", "body", "footer", "background", "accent", "textColor"];

function sanitizeDesign(input: unknown): PosterDesign {
  const src = (input ?? {}) as Record<string, unknown>;
  const out = {} as PosterDesign;
  for (const key of FIELDS) {
    const v = src[key];
    out[key] = typeof v === "string" ? v.slice(0, 2000) : "";
  }
  return out;
}

export async function GET() {
  try {
    const user = await requireApiUser(["director", "teacher"]);
    const db = await readDb();
    const posters = user.role === "director" ? db.posters : db.posters.filter((p) => p.authorId === user.id);
    return Response.json({ posters });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiUser(["director", "teacher"]);
    const input = (await req.json().catch(() => ({}))) as { id?: string; name?: string; design?: unknown };
    const name = input.name?.trim() || "Untitled poster";
    const design = sanitizeDesign(input.design);

    const poster = await mutateDb((db) => {
      if (input.id) {
        const existing = db.posters.find((p) => p.id === input.id);
        if (!existing) throw new HttpError(404, "Poster not found");
        if (existing.authorId !== user.id && user.role !== "director") throw new HttpError(403, "Not allowed");
        existing.name = name;
        existing.design = design;
        return existing;
      }
      const created: Poster = { id: newId("p"), name, design, authorId: user.id, createdAt: new Date().toISOString() };
      db.posters.push(created);
      return created;
    });
    return Response.json({ poster });
  } catch (err) {
    return errorResponse(err);
  }
}
