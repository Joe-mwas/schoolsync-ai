import { HttpError } from "./errors.ts";
import { FACT_TOPICS, isLeader, type Database, type FactTopic, type SchoolFact, type User } from "./types.ts";

export const MAX_FACTS = 300;
const MAX_DETAILS = 2000;

export interface FactInput {
  topic?: unknown;
  title?: unknown;
  details?: unknown;
  visibleTo?: unknown;
  fromAiLogId?: unknown;
}

function clean(db: Database, input: FactInput): Pick<SchoolFact, "topic" | "title" | "details" | "visibleTo" | "fromAiLogId"> {
  const topic = FACT_TOPICS.includes(input.topic as FactTopic) ? (input.topic as FactTopic) : "Other";
  const title = typeof input.title === "string" ? input.title.trim().slice(0, 120) : "";
  const details = typeof input.details === "string" ? input.details.trim() : "";
  if (!title) throw new HttpError(400, "Give the fact a short title, e.g. How to pay fees");
  if (!details) throw new HttpError(400, "Write the fact itself");
  if (details.length > MAX_DETAILS) throw new HttpError(400, `Keep each fact under ${MAX_DETAILS} characters; split long ones into several facts`);
  const fromAiLogId = typeof input.fromAiLogId === "string" && db.aiLogs.some((l) => l.id === input.fromAiLogId) ? input.fromAiLogId : null;
  return { topic, title, details, visibleTo: input.visibleTo === "staff" ? "staff" : "everyone", fromAiLogId };
}

export function createFact(db: Database, actor: User, input: FactInput): SchoolFact {
  if (db.facts.length >= MAX_FACTS) throw new HttpError(400, `The school can keep up to ${MAX_FACTS} facts; combine or remove some first`);
  const fact: SchoolFact = { id: `fact-${crypto.randomUUID().slice(0, 8)}`, ...clean(db, input), updatedAt: new Date().toISOString(), updatedBy: actor.id };
  db.facts.push(fact);
  // A correction from AI Review closes the loop on that answer.
  const log = fact.fromAiLogId ? db.aiLogs.find((l) => l.id === fact.fromAiLogId) : undefined;
  if (log) {
    log.factId = fact.id;
    log.reviewedAt ??= fact.updatedAt;
  }
  return fact;
}

export function updateFact(db: Database, actor: User, id: string, input: FactInput): SchoolFact {
  const fact = db.facts.find((f) => f.id === id);
  if (!fact) throw new HttpError(404, "Fact not found");
  Object.assign(fact, clean(db, { ...input, fromAiLogId: fact.fromAiLogId }), { updatedAt: new Date().toISOString(), updatedBy: actor.id });
  return fact;
}

/** Removes the fact and returns it (so its picture file can be deleted too). */
export function deleteFact(db: Database, id: string): SchoolFact {
  const idx = db.facts.findIndex((f) => f.id === id);
  if (idx === -1) throw new HttpError(404, "Fact not found");
  for (const l of db.aiLogs) if (l.factId === id) l.factId = null;
  return db.facts.splice(idx, 1)[0];
}

/** Facts this person may be told: staff-only facts never reach parents or learners. */
export function factsFor(db: Pick<Database, "facts">, user: Pick<User, "role">): SchoolFact[] {
  const staff = isLeader(user.role) || user.role === "teacher";
  return db.facts.filter((f) => f.visibleTo === "everyone" || staff);
}

/**
 * The facts as the AI sees them, grouped by topic in a stable order. With
 * `pictures`, facts that have a picture are tagged so the AI can attach it.
 */
export function factsPrompt(facts: SchoolFact[], pictures = false): string {
  if (facts.length === 0) return "";
  const lines: string[] = [];
  for (const topic of FACT_TOPICS) {
    const group = facts.filter((f) => f.topic === topic).sort((a, b) => a.title.localeCompare(b.title));
    if (group.length === 0) continue;
    lines.push(`## ${topic}`);
    for (const f of group) lines.push(`- ${f.title}: ${f.details}${pictures && f.image ? ` [picture available: [[picture:${f.id}]]]` : ""}`);
  }
  return lines.join("\n");
}

const PICTURE_WORDS = /\b(pictures?|photos?|photographs?|pics?|images?|picha|foto|show me|nionyeshe|look like|looks like|inaonekana)\b/i;
const IGNORED = new Set(["picture", "pictures", "photo", "photos", "photograph", "photographs", "pics", "image", "images", "picha", "foto", "show", "please", "send", "what", "does", "look", "like", "looks", "school", "nionyeshe", "tafadhali", "naomba", "nitumie", "inaonekana", "your", "have", "with", "this", "that", "there", "about"]);
/** Swahili (and common) words for the things schools usually photograph. */
const ALIASES: Record<string, string> = { sare: "uniform", uniforms: "uniform", rangi: "uniform", basi: "transport", gari: "transport", bus: "transport", chakula: "meals", lunch: "meals", menu: "meals", ratiba: "term dates", kalenda: "term dates", calendar: "term dates", karo: "fees", ada: "fees", malipo: "fees" };

/**
 * "Send me a picture of the uniform" → the fact with that picture. Needs a
 * picture word and a word that names the fact; otherwise null (the AI decides).
 */
export function pictureRequest(db: Pick<Database, "facts">, user: Pick<User, "role">, text: string): SchoolFact | null {
  if (!PICTURE_WORDS.test(text)) return null;
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const wanted = words.filter((w) => w.length >= 3 && !IGNORED.has(w)).flatMap((w) => [w, ...(ALIASES[w] ? [ALIASES[w]] : [])]);
  let best: SchoolFact | null = null;
  let bestScore = 0;
  for (const f of factsFor(db, user)) {
    if (!f.image) continue;
    const name = `${f.topic} ${f.title}`.toLowerCase();
    const score = wanted.filter((w) => name.includes(w) || (w.endsWith("s") && name.includes(w.slice(0, -1)))).length;
    if (score > bestScore) [best, bestScore] = [f, score];
  }
  return best;
}

/**
 * Pull the AI's [[picture:fact-id]] markers out of a reply. Only facts this
 * person may see, that have a picture, are kept.
 */
export function extractPictures(db: Pick<Database, "facts">, user: Pick<User, "role">, reply: string): { text: string; facts: SchoolFact[] } {
  const visible = factsFor(db, user);
  const facts: SchoolFact[] = [];
  const text = reply
    .replace(/\[?\[\[picture:([\w-]+)\]\]\]?/g, (_m, id: string) => {
      const f = visible.find((x) => x.id === id && x.image);
      if (f && !facts.includes(f)) facts.push(f);
      return "";
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, facts };
}
