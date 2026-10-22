import { redirect } from "next/navigation";
import { aiConfigured } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import Chat from "./Chat";

const SUGGESTIONS: Record<string, string[]> = {
  admin: ["Summarise this week's announcements", "What events are coming up?", "Draft a reminder about the PTA meeting"],
  director: ["Summarise this week's announcements", "Draft a reminder about the PTA meeting", "What events are coming up?"],
  headteacher: ["Draft a notice about the staff meeting", "What events are coming up?", "Summarise this week's announcements"],
  secretary: ["Draft a fee reminder notice", "What events are coming up?", "Summarise this week's announcements"],
  teacher: ["Draft a homework reminder for my class", "What's happening this month?", "Write a note to parents about the science trip"],
  parent: ["What does my child need to do this week?", "When is the next PTA meeting?", "Are there any urgent notices?"],
  student: ["Which assignments are due this week?", "Quiz me for my revision", "Explain fractions with an example"],
};

export default async function AssistantPage() {
  const user = await requireUser();
  // The director's assistant is the School AI (limited to the school; system questions go to the administrator).
  if (user.role === "director") redirect("/school-ai");
  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>AI Assistant</h1>
          <p>{user.role === "student" ? "Ask about your assignments, get a topic explained, or have it quiz you for revision." : user.role === "parent" ? "Ask about your children's results, fees, announcements and events." : "Ask about announcements, events and deadlines, or get help writing a message."}</p>
          <p className="small">Conversations are kept so the school&apos;s administrator can check the answers are right.</p>
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
