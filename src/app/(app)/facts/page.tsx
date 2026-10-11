import { requireUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { LEADERS } from "@/lib/types";
import FactsEditor from "./FactsEditor";

export default async function FactsPage({ searchParams }: { searchParams: Promise<{ fromLog?: string }> }) {
  await requireUser(LEADERS);
  const db = await readDb();
  const sp = await searchParams;
  // Arriving from AI Review: start a fact pre-filled from the flagged answer.
  const log = sp.fromLog ? db.aiLogs.find((l) => l.id === sp.fromLog) : undefined;
  const initialDraft = log
    ? { topic: "Other" as const, title: log.question.slice(0, 120), details: log.note ?? "", visibleTo: "everyone" as const, fromAiLogId: log.id }
    : null;
  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>School facts</h1>
          <p>
            Confirmed information the AI uses in every answer, on WhatsApp and on the website. Keep them up to date and the AI stops
            guessing. {db.facts.length} fact{db.facts.length === 1 ? "" : "s"} so far.
          </p>
        </div>
      </div>
      <FactsEditor facts={db.facts} initialDraft={initialDraft} correcting={log ? { question: log.question, answer: log.answer } : null} />
    </div>
  );
}
