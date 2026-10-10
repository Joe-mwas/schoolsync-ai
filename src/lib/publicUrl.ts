/**
 * The site's public address. Render sets RENDER_EXTERNAL_URL automatically;
 * PUBLIC_URL overrides it elsewhere. Never derived from request headers for
 * server-side requests, which a client could forge.
 */
export function configuredPublicUrl(env: Record<string, string | undefined> = process.env): string | null {
  const url = (env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || "").trim().replace(/\/+$/, "");
  return /^https?:\/\/[^\s/]+$/.test(url) ? url : null;
}

/** For display only (e.g. the webhook address to paste into Meta). */
export function displayOrigin(headers: Headers, env: Record<string, string | undefined> = process.env): string {
  const configured = configuredPublicUrl(env);
  if (configured) return configured;
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost:3000";
  const proto = headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto.split(",")[0]}://${host.split(",")[0]}`;
}
