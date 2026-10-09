import { aiConfigured } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import Chat from "./Chat";

const SUGGESTIONS: Record<string, string[]> = {
  director: ["Summarise this week's announcements", "Draft a reminder about the PTA meeting", "What events are coming up?"],
  teacher: ["Draft a homework reminder for my class", "What's happening this month?", "Write a note to parents about the science trip"],
  parent: ["What does my child need to do this week?", "When is the next PTA meeting?", "Are there any urgent notices?"],
  student: ["What's on this week?", "When do exams start?", "Any announcements for my class?"],
};

export default async function AssistantPage() {
  const user = await requireUser();
  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>AI Assistant</h1>
          <p>Ask about announcements, events and deadlines, or get help writing a message.</p>
        </div>
      </div>
      {aiConfigured() ? (
        <Chat suggestions={SUGGESTIONS[user.role]} />
      ) : (
        <div className="notice">The assistant is not configured. Set <code>ANTHROPIC_API_KEY</code> and restart the server.</div>
      )}
    </div>
  );
}
