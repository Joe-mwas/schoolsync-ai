/**
 * What the director's Setup page reports: each item is a setting or fact,
 * whether it's in place, and what to do if not. Pure, so it's easy to test.
 */

export type ItemStatus = "ok" | "missing" | "warn" | "optional";

export interface SetupItem {
  id: string;
  label: string;
  status: ItemStatus;
  detail: string;
  /** The hosting setting to change, when there is one. */
  envVar?: string;
  /** Recommended but never required (doesn't count towards "ready"). */
  recommended?: true;
}

export interface SetupSection {
  id: "basics" | "ai" | "whatsapp";
  title: string;
  items: SetupItem[];
}

type Env = Record<string, string | undefined>;
const has = (env: Env, key: string) => Boolean(env[key]?.trim());

export interface SetupFacts {
  /** Newest backup's time, if any. */
  lastBackupAt: string | null;
  now?: number;
}

export function setupChecklist(env: Env, facts: SetupFacts): SetupSection[] {
  const production = env.NODE_ENV === "production";
  const now = facts.now ?? Date.now();
  const backupAgeDays = facts.lastBackupAt ? (now - Date.parse(facts.lastBackupAt)) / 86_400_000 : null;

  const basics: SetupItem[] = [
    {
      id: "session-secret",
      label: "Sign-in security key",
      envVar: "SESSION_SECRET",
      ...(has(env, "SESSION_SECRET") && env.SESSION_SECRET !== "change-me"
        ? { status: "ok", detail: "Set." }
        : production
          ? { status: "missing", detail: "Required in production. Render's Blueprint generates it; add a long random value." }
          : { status: "optional", detail: "Not needed while developing." }),
    },
    {
      id: "data-file",
      label: "Data saved on the persistent disk",
      envVar: "DATA_FILE",
      ...(has(env, "DATA_FILE")
        ? { status: "ok", detail: `Saving to ${env.DATA_FILE}.` }
        : production
          ? { status: "warn", detail: "Not set, so data is saved inside the app folder and could be lost on redeploy. On Render use /var/data/db.json." }
          : { status: "optional", detail: "Using the default data/db.json." }),
    },
    {
      id: "country-code",
      label: "Country code for phone numbers",
      envVar: "DEFAULT_COUNTRY_CODE",
      ...(has(env, "DEFAULT_COUNTRY_CODE")
        ? { status: "ok", detail: `+${env.DEFAULT_COUNTRY_CODE!.replace(/\D/g, "")}: local numbers like 0712 345 678 are understood.` }
        : { status: "warn", detail: "Not set, so parents must type numbers with the country code (+254…). Set it to 254 for Kenya." }),
    },
    {
      id: "school-name",
      label: "School name",
      envVar: "SCHOOL_NAME",
      recommended: true,
      ...(has(env, "SCHOOL_NAME")
        ? { status: "ok", detail: `"${env.SCHOOL_NAME!.trim()}" appears in briefs and WhatsApp announcements.` }
        : { status: "optional", detail: 'Shown at the top of the director\'s brief and at the end of WhatsApp announcements (otherwise "SchoolSync").' }),
    },
    {
      id: "demo-accounts",
      label: "No public demo accounts",
      ...(production && (env.SEED_DEMO === "1" || env.SHOW_DEMO_ACCOUNTS === "1")
        ? {
            status: "warn",
            detail: "SEED_DEMO or SHOW_DEMO_ACCOUNTS is on. Demo accounts share a public password; remove these settings for a real school.",
          }
        : { status: "ok", detail: "Demo accounts are off." }),
    },
    {
      id: "backups",
      label: "Recent backup",
      ...(backupAgeDays === null
        ? { status: "warn", detail: "No backups yet. One is made automatically the first time data changes each day, or click Back up now in School Admin." }
        : backupAgeDays <= 2
          ? { status: "ok", detail: "A backup was saved in the last 2 days. Remember to download a copy weekly." }
          : { status: "warn", detail: `The newest backup is ${Math.floor(backupAgeDays)} days old. Back up now in School Admin.` }),
    },
  ];

  const ai: SetupItem[] = [
    {
      id: "anthropic-key",
      label: "Claude API key",
      envVar: "ANTHROPIC_API_KEY",
      ...(has(env, "ANTHROPIC_API_KEY") || has(env, "ANTHROPIC_AUTH_TOKEN")
        ? { status: "ok", detail: "Set. Use Test AI below to confirm it works." }
        : {
            status: "missing",
            detail: "Create a key at platform.claude.com (Settings → API Keys) and add it here. The assistant and AI drafting stay off until then.",
          }),
    },
  ];

  const wa = (envVar: string, label: string, whereFrom: string, required = true): SetupItem => ({
    id: envVar.toLowerCase(),
    label,
    envVar,
    ...(has(env, envVar) ? { status: "ok", detail: "Set." } : { status: required ? "missing" : "optional", detail: whereFrom }),
  });
  const whatsapp: SetupItem[] = [
    wa("WHATSAPP_TOKEN", "Access token", "Meta Business settings → System users → Generate token (expiry: Never)."),
    wa("WHATSAPP_PHONE_NUMBER_ID", "Phone number ID", "Meta developer app → WhatsApp → API Setup, under the phone number."),
    wa("WHATSAPP_VERIFY_TOKEN", "Webhook verify token", "Any phrase you choose (letters and numbers). Type the same phrase into Meta's webhook form."),
    wa("WHATSAPP_APP_SECRET", "App secret", "Meta developer app → App settings → Basic → App secret."),
    {
      id: "whatsapp_template_name",
      label: "Announcement template",
      envVar: "WHATSAPP_TEMPLATE_NAME",
      recommended: true,
      ...(has(env, "WHATSAPP_TEMPLATE_NAME")
        ? { status: "ok", detail: `Using "${env.WHATSAPP_TEMPLATE_NAME!.trim()}" for parents who haven't messaged in 24 hours.` }
        : {
            status: "optional",
            detail: "Without an approved template, only parents who messaged the school in the last 24 hours receive announcements. See the WhatsApp page for how to create it.",
          }),
    },
  ];

  return [
    { id: "basics", title: "Basics", items: basics },
    { id: "ai", title: "AI assistant (Claude)", items: ai },
    { id: "whatsapp", title: "WhatsApp (Meta)", items: whatsapp },
  ];
}

/** Items that block a feature (missing), not ones that are merely recommended. */
export function countReady(sections: SetupSection[]): { ready: number; total: number } {
  const items = sections.flatMap((s) => s.items).filter((i) => !i.recommended && i.status !== "optional");
  return { ready: items.filter((i) => i.status === "ok").length, total: items.length };
}
