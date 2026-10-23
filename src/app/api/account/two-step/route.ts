import QRCode from "qrcode";
import { logActivity } from "@/lib/activity";
import { errorResponse, HttpError, isStaff, requireApiUser, setSessionCookie } from "@/lib/auth";
import { schoolName } from "@/lib/ai";
import { mutateDb, readDb } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { formatSecret, newBackupCodes, newSecret, otpauthUrl, verifyCode } from "@/lib/totp";

/**
 * Staff turn two-step sign-in on or off for their own account:
 * start (a new key and QR code), confirm (the first code from the app),
 * codes (new backup codes) and off. Turning it off needs the password.
 */
export async function POST(req: Request) {
  try {
    const me = await requireApiUser(undefined, { allowPendingTwoStep: true });
    if (!isStaff(me)) throw new HttpError(403, "Two-step sign-in is for staff accounts");
    const body = (await req.json().catch(() => ({}))) as { action?: string; code?: string; password?: string };

    if (body.action === "start") {
      const secret = newSecret();
      await mutateDb((db) => {
        const u = db.users.find((x) => x.id === me.id);
        if (u) u.twoStepPending = { secret, createdAt: new Date().toISOString() };
      });
      const url = otpauthUrl(`${schoolName()} (SchoolSync)`, me.email || me.name, secret);
      const qr = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
      return Response.json({ qr, key: formatSecret(secret), url }, { headers: { "Cache-Control": "no-store" } });
    }

    if (body.action === "confirm") {
      const { codes, hashes } = newBackupCodes();
      const replaced = await mutateDb((db) => {
        const u = db.users.find((x) => x.id === me.id);
        const pending = u?.twoStepPending;
        if (!u || !pending) throw new HttpError(400, "Start again: click Set up two-step sign-in");
        if (Date.now() - Date.parse(pending.createdAt) > 30 * 60_000) throw new HttpError(400, "That setup expired. Start again.");
        const step = verifyCode(pending.secret, String(body.code ?? ""));
        if (step === null) throw new HttpError(400, "That code isn't right. Type the newest 6-digit code your app shows.");
        const had = Boolean(u.twoStep);
        u.twoStep = { secret: pending.secret, enabledAt: new Date().toISOString(), backupCodes: hashes, lastStep: step };
        u.twoStepPending = null;
        // Moving to a new phone signs out sessions that used the old one.
        if (had) u.sessionVersion = (u.sessionVersion ?? 0) + 1;
        return had ? u : null;
      });
      if (replaced) await setSessionCookie(replaced);
      await logActivity(req, me, "security", replaced ? "Moved two-step sign-in to a new phone" : "Turned on two-step sign-in");
      return Response.json({ backupCodes: codes }, { headers: { "Cache-Control": "no-store" } });
    }

    if (body.action === "codes" || body.action === "off") {
      if (!body.password || !verifyPassword(body.password, me.passwordHash)) throw new HttpError(400, "Your password is incorrect");
      if (body.action === "off" && (await readDb()).security.requireTwoStep) {
        throw new HttpError(400, "The school requires two-step sign-in for staff, so it can't be turned off. To use a new phone, choose Set up on a new phone.");
      }
      const { codes, hashes } = newBackupCodes();
      await mutateDb((db) => {
        const u = db.users.find((x) => x.id === me.id);
        if (!u?.twoStep) throw new HttpError(400, "Two-step sign-in isn't on");
        if (body.action === "off") u.twoStep = null;
        else u.twoStep.backupCodes = hashes;
      });
      await logActivity(req, me, "security", body.action === "off" ? "Turned off two-step sign-in" : "Made new backup codes");
      return Response.json(body.action === "off" ? { ok: true } : { backupCodes: codes }, { headers: { "Cache-Control": "no-store" } });
    }

    throw new HttpError(400, "Unknown action");
  } catch (err) {
    return errorResponse(err);
  }
}
