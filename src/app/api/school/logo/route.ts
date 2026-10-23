import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { dataFile, mutateDb, readDb } from "@/lib/db";
import { deleteFactImage, readFactImage, saveFactImage } from "@/lib/factImages";
import { ADMINS } from "@/lib/types";

/** The school's logo. Public: the sign-in page shows it before anyone signs in. */
export async function GET() {
  const logo = (await readDb()).profile?.logo;
  const bytes = logo ? await readFactImage(dataFile(), logo) : null;
  if (!logo || !bytes) return new Response("No logo", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": logo.type, "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" },
  });
}

/** POST the picture (raw bytes, JPEG or PNG) to set or replace the logo. */
export async function POST(req: Request) {
  try {
    await requireApiUser(ADMINS);
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length > 2 * 1024 * 1024) throw new HttpError(400, "That logo is over 2 MB; use a smaller picture");
    const logo = await saveFactImage(dataFile(), bytes);
    const old = await mutateDb((db) => {
      const previous = db.profile.logo;
      db.profile = { ...db.profile, logo, updatedAt: new Date().toISOString() };
      return previous;
    });
    await deleteFactImage(dataFile(), old);
    return Response.json({ logo }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE() {
  try {
    await requireApiUser(ADMINS);
    const old = await mutateDb((db) => {
      const previous = db.profile.logo;
      db.profile = { ...db.profile, logo: null, updatedAt: new Date().toISOString() };
      return previous;
    });
    await deleteFactImage(dataFile(), old);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
