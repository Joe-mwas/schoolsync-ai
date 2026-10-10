import { requireUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { templateConfig, whatsappConfigured } from "@/lib/whatsapp";
import Simulator from "./Simulator";

export default async function WhatsAppPage() {
  await requireUser(["director"]);
  const db = await readDb();
  const names = new Map(db.users.map((u) => [u.id, u.name]));
  const messages = [...db.whatsappMessages].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200);
  const live = whatsappConfigured();
  const template = templateConfig();

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>WhatsApp</h1>
          <p>Broadcast log and AI auto-replies to parents and staff.</p>
        </div>
        <span className={`badge ${live ? "ok" : "urgent"}`}>{live ? "Live — Cloud API connected" : "Simulation mode"}</span>
      </div>

      <div className="card stack">
        <h2>Setup</h2>
        <p className="small muted">
          Point your Meta app&apos;s webhook at <code>/api/whatsapp/webhook</code> with the verify token from{" "}
          <code>WHATSAPP_VERIFY_TOKEN</code>, and subscribe to the <code>messages</code> field. Incoming messages from registered
          phone numbers are answered by the AI assistant using that person&apos;s school information.
        </p>
        <h3>Announcement template</h3>
        {template ? (
          <p className="small">
            <span className="badge ok">Configured</span> Using template <code>{template.name}</code> ({template.language}) for anyone
            who hasn&apos;t messaged the school in the last 24 hours. Everyone else gets the announcement as a normal message.
          </p>
        ) : (
          <p className="small">
            <span className="badge urgent">Not configured</span> WhatsApp only delivers normal messages to people who messaged the
            school in the last 24 hours, so other parents won&apos;t receive announcements.
          </p>
        )}
        <details className="small">
          <summary>How to create the template</summary>
          <ol>
            <li>In WhatsApp Manager, open <strong>Message templates → Create template</strong>.</li>
            <li>Category <strong>Utility</strong>, name <code>school_announcement</code>, language <strong>English</strong>.</li>
            <li>
              Body, exactly two variables:
              <pre style={{ whiteSpace: "pre-wrap" }}>{"📢 {{1}}\n\n{{2}}\n\nReply to this message if you have any questions."}</pre>
              Give sample values such as &quot;Sports day&quot; and &quot;Sports day is on Friday at 9 AM.&quot;
            </li>
            <li>Submit for review (usually minutes to a day).</li>
            <li>
              Once approved, set <code>WHATSAPP_TEMPLATE_NAME=school_announcement</code> and{" "}
              <code>WHATSAPP_TEMPLATE_LANGUAGE=en</code> in your hosting environment and restart.
            </li>
          </ol>
        </details>
      </div>

      <Simulator phones={db.users.filter((u) => u.phone).map((u) => ({ phone: u.phone!, label: `${u.name} (${u.role})` }))} />

      <div className="card">
        <h2>Message log</h2>
        {messages.length === 0 ? (
          <p className="muted">No messages yet. Send an announcement via WhatsApp to get started.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Direction</th>
                  <th>Contact</th>
                  <th>Message</th>
                  <th>Type</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((m) => (
                  <tr key={m.id}>
                    <td className="small">{new Date(m.createdAt).toLocaleString("en-GB")}</td>
                    <td>{m.direction === "inbound" ? "← In" : "→ Out"}</td>
                    <td className="small">
                      {m.userId ? names.get(m.userId) ?? m.phone : m.phone}
                      <div className="muted">{m.phone}</div>
                    </td>
                    <td className="small" style={{ whiteSpace: "pre-wrap", maxWidth: 420 }}>{m.body}</td>
                    <td className="small">{m.direction === "outbound" ? (m.kind === "template" ? "Template" : "Text") : "—"}</td>
                    <td>
                      <span
                        className={`badge ${m.status === "failed" ? "urgent" : ["sent", "delivered", "read"].includes(m.status) ? "ok" : ""}`}
                        title={m.error ?? undefined}
                      >
                        {m.status}
                      </span>
                      {m.error && <div className="small error">{m.error}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
