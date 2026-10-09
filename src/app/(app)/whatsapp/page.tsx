import { requireUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { whatsappConfigured } from "@/lib/whatsapp";
import Simulator from "./Simulator";

export default async function WhatsAppPage() {
  await requireUser(["director"]);
  const db = await readDb();
  const names = new Map(db.users.map((u) => [u.id, u.name]));
  const messages = [...db.whatsappMessages].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200);
  const live = whatsappConfigured();

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
                    <td>
                      <span className={`badge ${m.status === "failed" ? "urgent" : m.status === "sent" ? "ok" : ""}`} title={m.error ?? undefined}>
                        {m.status}
                      </span>
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
