import Anthropic from "@anthropic-ai/sdk";
import { briefData, formatBrief, type BriefData } from "./brief.ts";
import { factsFor, factsPrompt } from "./facts.ts";
import { feeStatement, formatFeeStatement, formatMoney, schoolFees } from "./fees.ts";
import { ROLE_LABELS, userClassIds, visibleAnnouncements } from "./permissions.ts";
import { examPerformance, examsFor, formatReport, studentReport } from "./results.ts";
import { isLeader, isOffice } from "./types.ts";
import type { Database, User } from "./types.ts";

export const MODEL = "claude-opus-5-5";
// Server-side fallback: if a request is declined by a safety classifier, the
// API re-runs it on Anthropic's recommended fallback model in the same call.
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | null = null;

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

const BASE_SYSTEM = `You are SchoolSync Assistant, the AI helper for a school's communication platform.
You help directors, teachers, parents and students with questions about school announcements, events, classes and schedules, and you help staff write clear, friendly school communications.

Guidelines:
- Answer from the school information provided below. If the answer is not there, say so and suggest contacting the school office rather than guessing.
- Only discuss information the current user is allowed to see; it has already been filtered for them.
- Keep answers concise and warm. Parents often read on WhatsApp, so prefer short paragraphs and plain text.
- When drafting messages for staff, match the school's tone: polite, clear, and action-oriented, with dates and deadlines stated explicitly.
- <school_facts> are confirmed by the school itself. They override anything else you know or assume; when a question is covered by a fact, answer from it.
- For results and fees, use only the figures in <records>. Never estimate or invent a level, amount or date; if it isn't there, say so.
- CBC levels: EE = Exceeding Expectations, ME = Meeting Expectations, AE = Approaching Expectations, BE = Below Expectations.`;

/**
 * Results and fees this person is entitled to: parents see their own
 * children's, learners their own results, teachers their classes' results,
 * and leaders school-wide totals. Nothing else ever reaches the AI.
 */
function recordsFor(user: User, db: Database): string {
  if (user.role === "parent") {
    return db.users
      .filter((u) => user.childIds.includes(u.id) && u.role === "student")
      .map((k) => `${formatReport(k.name, studentReport(db, k.id))}\n${formatFeeStatement(k.name, feeStatement(db, k.id))}`)
      .join("\n\n");
  }
  if (user.role === "student") return formatReport(user.name, studentReport(db, user.id));
  if (user.role === "teacher") {
    return db.classes
      .filter((c) => user.classIds.includes(c.id))
      .map((c) => {
        const ids = db.users.filter((u) => u.role === "student" && u.classIds.includes(c.id)).map((u) => u.id);
        const exam = examsFor(db, ids)[0];
        const p = exam ? examPerformance(db, exam).find((x) => x.classId === c.id) : undefined;
        return p
          ? `${c.name}, ${exam}: EE ${p.counts.EE}, ME ${p.counts.ME}, AE ${p.counts.AE}, BE ${p.counts.BE}; weakest area ${p.weakestArea}; needing support: ${p.needingSupport.join(", ") || "none"}`
          : `${c.name}: no results yet`;
      })
      .join("\n");
  }
  if (isOffice(user.role)) {
    const f = schoolFees(db, new Date(Date.now() - 7 * 86_400_000).toISOString());
    const exam = examsFor(db)[0];
    const perf = exam ? examPerformance(db, exam) : [];
    return [
      `Fees: ${formatMoney(f.paid)} collected of ${formatMoney(f.charged)}; ${formatMoney(f.outstanding)} outstanding; ${formatMoney(f.collectedSince)} collected in the last 7 days.`,
      ...f.byClass.map((c) => `- ${c.className}: ${formatMoney(c.outstanding)} owed by ${c.learnersOwing} learners`),
      exam ? `Latest results (${exam}):` : "No results yet.",
      ...perf.map((p) => `- ${p.className}: EE ${p.counts.EE}, ME ${p.counts.ME}, AE ${p.counts.AE}, BE ${p.counts.BE}; weakest ${p.weakestArea}`),
    ].join("\n");
  }
  return "";
}

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
    `<records>\n${recordsFor(user, db) || "(none)"}\n</records>`,
  ]
    .filter(Boolean)
    .join("\n");
}

function systemBlocks(context: string, user: User, db: Database, pictures = false): Anthropic.Beta.BetaTextBlockParam[] {
  const facts = factsPrompt(factsFor(db, user), pictures);
  return [
    // Stable parts first so they can be cached: the instructions, then the
    // school's facts (the same for every parent, and for every staff member).
    { type: "text", text: BASE_SYSTEM, cache_control: { type: "ephemeral" } },
    ...(facts ? [{ type: "text" as const, text: `<school_facts>\n${facts}\n</school_facts>`, cache_control: { type: "ephemeral" as const } }] : []),
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
    system: systemBlocks(buildSchoolContext(user, db), user, db),
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
      `${buildSchoolContext(user, db)}\n\nThis conversation is happening over WhatsApp: reply in plain text (no Markdown), under 120 words. Some school facts have a picture, shown as [[picture:id]]. When the person asks to see something, or the picture clearly helps, put that marker on its own line at the end and the picture will be sent with your reply; never mention the marker itself.`,
      user,
      db,
      true,
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
    system: systemBlocks(buildSchoolContext(user, db), user, db),
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

export function schoolName(env: Record<string, string | undefined> = process.env): string {
  return env.SCHOOL_NAME?.trim() || "SchoolSync";
}

/**
 * The director's brief. With the AI, it reads like a short report and groups
 * what parents asked about into themes; without it (or if the AI fails), the
 * plain figures are sent instead, so a brief always arrives.
 */
export async function writeBrief(db: Database, data: BriefData): Promise<{ text: string; usedAi: boolean }> {
  const plain = formatBrief(schoolName(), data);
  if (!aiConfigured()) return { text: plain, usedAi: false };
  try {
    const response = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: [
        { type: "text", text: BASE_SYSTEM, cache_control: { type: "ephemeral" } },
        {
          type: "text",
          text: `You are writing the director's brief for ${schoolName()}, sent on WhatsApp.
Use only the facts in <figures> and <parent_messages>; never invent numbers, names or events.
Structure: a one-line headline of what matters most, then short sections: Fees, Results, Parents, Coming up, and finally "Suggested actions" (2–4 concrete steps).
For Parents, group the messages into themes (e.g. "3 parents asked about the trip date") and point out anything urgent or unhappy.
Plain text with WhatsApp formatting only (*bold* for section names), no tables, under 2,500 characters.`,
        },
      ],
      messages: [
        {
          role: "user",
          content: `Write the brief covering ${data.period.label}.\n\n<figures>\n${plain}\n</figures>\n\n<parent_messages>\n${data.parentMessages.samples.map((s) => `- ${s}`).join("\n") || "(none)"}\n</parent_messages>`,
        },
      ],
    });
    if (response.stop_reason === "refusal") return { text: plain, usedAi: false };
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return text ? { text, usedAi: true } : { text: plain, usedAi: false };
  } catch (err) {
    console.error("AI brief failed; sending the plain figures", err);
    return { text: plain, usedAi: false };
  }
}

export { briefData };
