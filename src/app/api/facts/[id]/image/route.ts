import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { dataFile, mutateDb, readDb } from "@/lib/db";
import { deleteFactImage, MAX_IMAGE_BYTES, readFactImage, saveFactImage } from "@/lib/factImages";
import { factsFor } from "@/lib/facts";
import { LEADERS, type FactImage } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/** The picture itself, for anyone signed in who may see the fact. */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const user = await requireApiUser();
    const { id } = await params;
    const fact = factsFor(await readDb(), user).find((f) => f.id === id);
    const bytes = fact?.image ? await readFactImage(dataFile(), fact.image) : null;
    if (!fact?.image || !bytes) throw new HttpError(404, "Picture not found");
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": fact.image.type, "Cache-Control": "private, max-age=3600" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Add or replace a fact's picture (form field "file"). */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const user = await requireApiUser(LEADERS);
    const { id } = await params;
    if (Number(req.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES + 64 * 1024) throw new HttpError(400, "That picture is over 5 MB; use a smaller one");
    const file = (await req.formData().catch(() => null))?.get("file");
    if (!(file instanceof Blob)) throw new HttpError(400, "Choose a picture to upload");
    if (!(await readDb()).facts.some((f) => f.id === id)) throw new HttpError(404, "Fact not found");
    const image = await saveFactImage(dataFile(), new Uint8Array(await file.arrayBuffer()));
    let old: FactImage | null | undefined;
    try {
      const fact = await mutateDb((db) => {
        const f = db.facts.find((x) => x.id === id);
        if (!f) throw new HttpError(404, "Fact not found");
        old = f.image;
        f.image = image;
        f.updatedAt = new Date().toISOString();
        f.updatedBy = user.id;
        return f;
      });
      await deleteFactImage(dataFile(), old);
      return Response.json({ fact });
    } catch (err) {
      await deleteFactImage(dataFile(), image);
      throw err;
    }
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const user = await requireApiUser(LEADERS);
    const { id } = await params;
    let old: FactImage | null | undefined;
    const fact = await mutateDb((db) => {
      const f = db.facts.find((x) => x.id === id);
      if (!f) throw new HttpError(404, "Fact not found");
      old = f.image;
      f.image = null;
      f.updatedAt = new Date().toISOString();
      f.updatedBy = user.id;
      return f;
    });
    await deleteFactImage(dataFile(), old);
    return Response.json({ fact });
  } catch (err) {
    return errorResponse(err);
  }
}
