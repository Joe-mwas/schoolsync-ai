import { aiConfigured } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import AdminAiChat from "./AdminAiChat";

export default async function AdminAiPage() {
  await requireUser(["admin"]);
  const db = await readDb();
  const actions = [...db.adminActions].sort((a, b) => b.proposedAt.localeCompare(a.proposedAt));
  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>Admin AI</h1>
          <p>
            Your private helper for running SchoolSync. Describe a problem (&quot;James didn&apos;t get the fee reminder&quot;, &quot;a parent
            can&apos;t sign in&quot;) and it investigates, explains, and proposes fixes that only happen when you click <strong>Approve</strong>.
            It can also write up new features you want. Only the administrator can see this page.
          </p>
        </div>
      </div>
      {!aiConfigured() ? (
        <div className="notice">Connect Claude first: add ANTHROPIC_API_KEY in Render (see the Setup page). The Admin AI uses it.</div>
      ) : (
        <AdminAiChat
          pending={actions.filter((a) => a.status === "pending")}
          recent={actions.filter((a) => a.status !== "pending").slice(0, 10)}
          featureRequests={[...db.featureRequests].sort((a, b) => b.createdAt.localeCompare(a.createdAt))}
        />
      )}
    </div>
  );
}
