import { requireUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { OFFICE } from "@/lib/types";
import EventsManager from "./EventsManager";

export default async function EventsPage() {
  await requireUser(OFFICE);
  const db = await readDb();
  const events = [...db.events].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>Events</h1>
          <p>The school calendar. Everyone sees it on their dashboard, parents get it on WhatsApp (reply 3), and the AI uses it to answer questions.</p>
        </div>
      </div>
      <EventsManager events={events.map((e) => ({ id: e.id, title: e.title, date: e.date, description: e.description }))} today={new Date().toISOString().slice(0, 10)} />
    </div>
  );
}
