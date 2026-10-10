import Anthropic from "@anthropic-ai/sdk";
import { ROLE_LABELS, userClassIds, visibleAnnouncements } from "./permissions.ts";
import type { Database, User } from "./types.ts";

export const MODEL = "claude-opus-5-5";
// Server-side fallback: if a request is declined by a safety classifier, the
// API re-runs it on Anthropic's recommended fallback model in the same call.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | null = null;

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

const BASE_SYSTEM = `You are SchoolSync Assistant, the AI helper for a school's communication platform.
You help directors, teachers, parents and students with questions about school announcements, events, classes and schedules, and you help staff write clear, friendly school communications.

Guidelines:
- Answer from the school information provided below. If the answer is not there, say so and suggest contacting the school office rather than guessing.
- Only discuss information the current user is allowed to see; it has already been filtered for them.
- Keep answers concise and warm. Parents often read on WhatsApp, so prefer short paragraphs and plain text.
- When drafting messages for staff, match the school's tone: polite, clear, and action-oriented, with dates and deadlines stated explicitly.`;

/** The per-user slice of school data the assistant may see. */
export function buildSchoolContext(user: User, db: Database): string {
  const classNames = new Map(db.classes.map((c) => [c.id, c.name]));
  const myClasses = userClassIds(user, db).map((id) => classNames.get(id) ?? id);
  const children = db.users.filter((u) => user.childIds.includes(u.id)).map((u) => u.name);

  const announcements = visibleAnnouncements(user, db)
    .slice(0, 20)
    .map((a) => {
      const scope = a.classId ? classNames.get(a.classId) ?? a.classId : "School-wide";
      return `- [${a.createdAt.slice(0, 10)}] ${a.priority === "urgent" ? "URGENT: " : ""}${a.title} (${scope})\n  ${a.body}`;
    })
    .join("\n");

  const events = [...db.events]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => `- ${e.date}: ${e.title} — ${e.description}`)
    .join("\n");

  return [
    `<current_user>`,
    `Name: ${user.name}`,
    `Role: ${ROLE_LABELS[user.role]}`,
    myClasses.length ? `Classes: ${myClasses.join(", ")}` : "",
    children.length ? `Children: ${children.join(", ")}` : "",
    `</current_user>`,
    `<announcements>\n${announcements || "(none)"}\n</announcements>`,
    `<upcoming_events>\n${events || "(none)"}\n</upcoming_events>`,
  ]
    .filter(Boolean)
    .join("\n");
}

function systemBlocks(context: string): Anthropic.Beta.BetaTextBlockParam[] {
  return [
    // Stable instructions first so they can be cached across users.
    { type: "text", text: BASE_SYSTEM, cache_control: { type: "ephemeral" } },
    { type: "text", text: `Today's date: ${new Date().toISOString().slice(0, 10)}\n\n${context}` },
  ];
}

/** Stream an assistant reply as plain text chunks. */
export async function* streamAssistantReply(
  user: User,
  db: Database,
  messages: Anthropic.Beta.BetaMessageParam[],
): AsyncGenerator<string> {
  const stream = getClient().beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: systemBlocks(buildSchoolContext(user, db)),
    messages,
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }

  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") {
    yield "\n\nSorry, I can't help with that request.";
  }
}

/** One-shot reply, used for WhatsApp auto-responses. */
export async function generateReply(user: User, db: Database, text: string): Promise<string> {
  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: systemBlocks(
      `${buildSchoolContext(user, db)}\n\nThis conversation is happening over WhatsApp: reply in plain text (no Markdown), under 120 words.`,
    ),
    messages: [{ role: "user", content: text }],
  });
  if (response.stop_reason === "refusal") {
    return "Sorry, I can't help with that. Please contact the school office.";
  }
  return response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

export interface AnnouncementDraft {
  title: string;
  body: string;
  whatsappText: string;
}

const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Short headline, under 60 characters" },
    body: { type: "string", description: "Full announcement for the school portal" },
    whatsappText: { type: "string", description: "Condensed plain-text version for WhatsApp, under 500 characters" },
  },
  required: ["title", "body", "whatsappText"],
  additionalProperties: false,
} as const;

/** Turn rough notes into a polished announcement. */
export async function draftAnnouncement(user: User, db: Database, notes: string): Promise<AnnouncementDraft> {
  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: DRAFT_SCHEMA } },
    system: systemBlocks(buildSchoolContext(user, db)),
    messages: [
      {
        role: "user",
        content: `Write a school announcement from these notes by ${user.name} (${ROLE_LABELS[user.role]}). Keep every fact from the notes and do not invent new ones.\n\n<notes>\n${notes}\n</notes>`,
      },
    ],
  });
  if (response.stop_reason === "refusal") {
    throw new Error("The assistant declined to draft this announcement.");
  }
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return JSON.parse(text) as AnnouncementDraft;
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

/** A tiny request to confirm the key, credit and model access all work. */
export async function testAiConnection(): Promise<ConnectionTestResult> {
  if (!aiConfigured()) return { ok: false, message: "ANTHROPIC_API_KEY isn't set. Add it in your hosting settings and redeploy." };
  try {
    const response = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "low" },
      messages: [{ role: "user", content: "This is a connection test from a school app. Reply with the single word: Connected" }],
    });
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return { ok: true, message: `Claude replied: "${text.slice(0, 80)}" (model ${response.model}).` };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return { ok: false, message: "The API key was rejected. It may be mistyped or deleted; create a new key at platform.claude.com → Settings → API Keys." };
    }
    if (err instanceof Anthropic.PermissionDeniedError) {
      return { ok: false, message: `The key isn't allowed to use this model: ${err.message}` };
    }
    if (err instanceof Anthropic.RateLimitError) {
      return { ok: false, message: "Too many requests right now. Wait a minute and test again." };
    }
    if (err instanceof Anthropic.BadRequestError) {
      // Most often a credit balance that's too low; the API's own message says which.
      return { ok: false, message: `Claude refused the request: ${err.message}. If it mentions credit, add credit at platform.claude.com → Settings → Billing.` };
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return { ok: false, message: "Couldn't reach the Claude API from the server. Try again shortly." };
    }
    if (err instanceof Anthropic.APIError) {
      return { ok: false, message: `Claude API error ${err.status}: ${err.message}` };
    }
    console.error("AI connection test failed", err);
    return { ok: false, message: "Unexpected error; see the server logs." };
  }
}
