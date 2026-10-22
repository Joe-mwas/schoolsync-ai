import { aiConfigured } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import AdminAiChat from "../admin-ai/AdminAiChat";

export default async function SchoolAiPage() {
  await requireUser(["director"]);
  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>School AI</h1>
          <p>
            Ask about the school: fees and payments, events and activities, and families (who owes, how to reach a parent, what parents are
            asking). Questions about the SchoolSync system itself are passed to the administrator. Your morning brief also arrives on WhatsApp
            each weekday.
          </p>
        </div>
      </div>
      {aiConfigured() ? (
        <AdminAiChat mode="director" pending={[]} recent={[]} featureRequests={[]} forwarded={[]} />
      ) : (
        <div className="notice">The School AI isn&apos;t switched on yet. The administrator needs to connect Claude.</div>
      )}
    </div>
  );
}
