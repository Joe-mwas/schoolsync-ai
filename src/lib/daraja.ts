import { timingSafeEqual } from "node:crypto";

/** Safaricom Daraja settings, from the environment. */
type Env = Record<string, string | undefined>;

const v = (env: Env, key: string) => env[key]?.trim() ?? "";

export interface DarajaConfig {
  base: string;
  sandbox: boolean;
  consumerKey: string;
  consumerSecret: string;
  shortCode: string;
  callbackToken: string;
}

export function darajaConfig(env: Env = process.env): DarajaConfig {
  const sandbox = v(env, "MPESA_ENV").toLowerCase() !== "production";
  return {
    base: sandbox ? "https://sandbox.safaricom.co.ke" : "https://api.safaricom.co.ke",
    sandbox,
    consumerKey: v(env, "MPESA_CONSUMER_KEY"),
    consumerSecret: v(env, "MPESA_CONSUMER_SECRET"),
    shortCode: v(env, "MPESA_SHORTCODE"),
    callbackToken: v(env, "MPESA_CALLBACK_TOKEN"),
  };
}

/** Enough to receive payments (Safaricom can post to us). */
export function mpesaReceiving(env: Env = process.env): boolean {
  const c = darajaConfig(env);
  return c.shortCode !== "" && c.callbackToken.length >= 16;
}

/** Enough to talk to Daraja (register our URLs). */
export function darajaConfigured(env: Env = process.env): boolean {
  const c = darajaConfig(env);
  return mpesaReceiving(env) && c.consumerKey !== "" && c.consumerSecret !== "";
}

/** The secret in our callback URLs: Safaricom doesn't sign its requests, so the URL itself is the key. */
export function validCallbackToken(token: string, env: Env = process.env): boolean {
  const expected = darajaConfig(env).callbackToken;
  if (expected.length < 16) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Where Safaricom posts payments. Daraja rejects URLs containing words such
 * as "mpesa" or "safaricom", so the path avoids them.
 */
export function callbackUrls(publicUrl: string, env: Env = process.env): { confirmation: string; validation: string } {
  const base = `${publicUrl.replace(/\/+$/, "")}/api/payments/c2b/${darajaConfig(env).callbackToken}`;
  return { confirmation: `${base}/confirm`, validation: `${base}/validate` };
}

async function accessToken(c: DarajaConfig): Promise<string> {
  const auth = Buffer.from(`${c.consumerKey}:${c.consumerSecret}`).toString("base64");
  const res = await fetch(`${c.base}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; errorMessage?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(res.status === 400 || res.status === 401 ? "Safaricom rejected the consumer key/secret. Copy them again from your Daraja app." : `Safaricom sign-in failed (HTTP ${res.status}${data.errorMessage ? `: ${data.errorMessage}` : ""})`);
  }
  return data.access_token;
}

/** Check the consumer key and secret work, without changing anything. */
export async function checkDarajaCredentials(env: Env = process.env): Promise<{ ok: boolean; message: string }> {
  const c = darajaConfig(env);
  if (!c.consumerKey || !c.consumerSecret) return { ok: false, message: "MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET must both be set." };
  try {
    await accessToken(c);
    return { ok: true, message: `Signed in to Safaricom ${c.sandbox ? "sandbox" : "production"}.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** Tell Safaricom where to send this Paybill's payments (C2B Register URL). */
export async function registerC2BUrls(publicUrl: string, env: Env = process.env): Promise<{ ok: boolean; message: string }> {
  const c = darajaConfig(env);
  if (!darajaConfigured(env)) return { ok: false, message: "Set MPESA_SHORTCODE, MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET and MPESA_CALLBACK_TOKEN first." };
  if (!/^https:\/\//.test(publicUrl)) return { ok: false, message: "Safaricom needs a public https address. Register from the live site, not localhost." };
  try {
    const token = await accessToken(c);
    const urls = callbackUrls(publicUrl, env);
    const res = await fetch(`${c.base}/mpesa/c2b/v2/registerurl`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ShortCode: c.shortCode, ResponseType: "Completed", ConfirmationURL: urls.confirmation, ValidationURL: urls.validation }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => ({}))) as { ResponseDescription?: string; errorMessage?: string; ResponseCode?: string };
    if (!res.ok) return { ok: false, message: `Safaricom said: ${data.errorMessage ?? data.ResponseDescription ?? `HTTP ${res.status}`}` };
    return { ok: true, message: `Registered with Safaricom: ${data.ResponseDescription ?? "success"}. Payments to ${c.shortCode} will now be recorded automatically.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
