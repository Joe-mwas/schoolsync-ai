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

export function deleteFact(db: Database, id: string): void {
  const idx = db.facts.findIndex((f) => f.id === id);
  if (idx === -1) throw new HttpError(404, "Fact not found");
  for (const l of db.aiLogs) if (l.factId === id) l.factId = null;
  db.facts.splice(idx, 1);
}

/** Facts this person may be told: staff-only facts never reach parents or learners. */
export function factsFor(db: Pick<Database, "facts">, user: Pick<User, "role">): SchoolFact[] {
  const staff = isLeader(user.role) || user.role === "teacher";
  return db.facts.filter((f) => f.visibleTo === "everyone" || staff);
}

/** The facts as the AI sees them, grouped by topic in a stable order. */
export function factsPrompt(facts: SchoolFact[]): string {
  if (facts.length === 0) return "";
  const lines: string[] = [];
  for (const topic of FACT_TOPICS) {
    const group = facts.filter((f) => f.topic === topic).sort((a, b) => a.title.localeCompare(b.title));
    if (group.length === 0) continue;
    lines.push(`## ${topic}`);
    for (const f of group) lines.push(`- ${f.title}: ${f.details}`);
  }
  return lines.join("\n");
}
