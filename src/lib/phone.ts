/**
 * Phone numbers are stored in international form (+254712345678). Local
 * numbers starting with 0 are converted using DEFAULT_COUNTRY_CODE, so a
 * parent can type 0712 345 678 and still match.
 */

export function defaultCountryCode(env: Record<string, string | undefined> = process.env): string {
  return (env.DEFAULT_COUNTRY_CODE ?? "").replace(/\D/g, "");
}

/** Canonical +digits form, or null if it doesn't look like a phone number. */
export function canonicalPhone(raw: string, countryCode = defaultCountryCode()): string | null {
  const trimmed = raw.trim();
  if (!/^\+?[\d\s().-]{7,20}$/.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return `+${digits}`;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("0") && countryCode) digits = countryCode + digits.slice(1);
  return digits.length >= 7 ? `+${digits}` : null;
}

/** Digits-only key for comparing numbers regardless of formatting. */
export function phoneKey(raw: string | undefined | null, countryCode = defaultCountryCode()): string {
  if (!raw) return "";
  return (canonicalPhone(raw, countryCode) ?? raw).replace(/\D/g, "");
}
