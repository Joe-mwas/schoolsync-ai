import { errorResponse, HttpError, requireApiUser } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { pushTo, removeSubscription, saveSubscription, vapidKeys } from "@/lib/push";

/** GET: the public key a browser needs to subscribe. */
export async function GET() {
  try {
    await requireApiUser(undefined, { allowPendingPasswordChange: true, allowPendingTwoStep: true });
    return Response.json({ publicKey: (await vapidKeys()).publicKey });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST { subscription, test? }: this device wants notifications (and a test one to show it works). */
export async function POST(req: Request) {
  try {
    const user = await requireApiUser(undefined, { allowPendingPasswordChange: true, allowPendingTwoStep: true });
    const { subscription, test } = (await req.json().catch(() => ({}))) as { subscription?: unknown; test?: unknown };
    await mutateDb((db) => saveSubscription(db, user.id, subscription));
    if (test === true) {
      const result = await pushTo([user.id], { title: "Notifications are on ✅", body: "You'll hear about announcements, posters and other news from your school here.", url: "/dashboard", tag: "welcome" });
      return Response.json({ ok: true, ...result });
    }
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE { endpoint }: stop notifications on this device. */
export async function DELETE(req: Request) {
  try {
    const user = await requireApiUser(undefined, { allowPendingPasswordChange: true, allowPendingTwoStep: true });
    const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: unknown };
    if (typeof endpoint !== "string") throw new HttpError(400, "Which device?");
    await mutateDb((db) => removeSubscription(db, user.id, endpoint));
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
