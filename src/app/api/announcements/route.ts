import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { broadcastAnnouncement } from "@/lib/broadcast";
import { mutateDb, newId, readDb } from "@/lib/db";
import { canPublish, canTargetClass, visibleAnnouncements } from "@/lib/permissions";
import { ROLES, type Announcement, type Role } from "@/lib/types";

export async function GET() {
  try {
    const user = await requireApiUser();
    return Response.json({ announcements: visibleAnnouncements(user, await readDb()) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiUser();
    if (!canPublish(user)) throw new HttpError(403, "Only directors and teachers can publish announcements");

    const input = (await req.json().catch(() => ({}))) as Partial<Announcement> & { sendWhatsApp?: boolean };
    const title = input.title?.trim();
    const body = input.body?.trim();
    if (!title || !body) throw new HttpError(400, "Title and body are required");

    const audience = (input.audience ?? []).filter((r): r is Role => (ROLES as readonly string[]).includes(r));
    if (audience.length === 0) throw new HttpError(400, "Choose at least one audience");

    const classId = input.classId || null;
    if (!canTargetClass(user, classId)) {
      throw new HttpError(403, user.role === "teacher" ? "Teachers can only post to their own classes" : "Not allowed");
    }

    const db = await readDb();
    if (classId && !db.classes.some((c) => c.id === classId)) throw new HttpError(400, "Unknown class");
    const posterId = input.posterId || null;
    if (posterId && !db.posters.some((p) => p.id === posterId)) throw new HttpError(400, "Unknown poster");

    const announcement: Announcement = {
      id: newId("a"),
      title,
      body,
      audience,
      classId,
      priority: input.priority === "urgent" ? "urgent" : "normal",
      authorId: user.id,
      createdAt: new Date().toISOString(),
      posterId,
      whatsappSentAt: null,
    };
    await mutateDb((d) => void d.announcements.push(announcement));

    const whatsapp = input.sendWhatsApp ? await broadcastAnnouncement(announcement.id) : null;
    return Response.json({ announcement, whatsapp }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
