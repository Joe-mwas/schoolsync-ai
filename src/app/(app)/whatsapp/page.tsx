import { requireUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { templateConfig, whatsappConfigured } from "@/lib/whatsapp";
import Link from "next/link";
import { ROLE_LABELS } from "@/lib/permissions";
import { phoneKey } from "@/lib/phone";
import Simulator from "./Simulator";
import ThreadComposer from "./ThreadComposer";
import ScrollToBottom from "@/components/ScrollToBottom";
import WaText from "@/components/WaText";
import { OFFICE } from "@/lib/types";

export default async function WhatsAppPage({ searchParams }: { searchParams: Promise<{ phone?: string }> }) {
  await requireUser(OFFICE);
  const db = await readDb();
  const sp = await searchParams;

  // Conversations: one thread per phone number, most recent first.
  const threads = new Map<string, { phone: string; last: (typeof db.whatsappMessages)[number]; count: number }>();
  for (const m of db.whatsappMessages) {
    const t = threads.get(m.phone);
    if (!t || t.last.createdAt < m.createdAt) threads.set(m.phone, { phone: m.phone, last: m, count: (t?.count ?? 0) + 1 });
    else t.count++;
  }
  const threadList = [...threads.values()].sort((a, b) => b.last.createdAt.localeCompare(a.last.createdAt));
  const contactFor = (phone: string) => db.users.find((u) => u.phone && phoneKey(u.phone) === phone);
  const selectedPhone = sp.phone && threads.has(sp.phone) ? sp.phone : threadList[0]?.phone;
  const thread = selectedPhone
    ? db.whatsappMessages.filter((m) => m.phone === selectedPhone).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-60)
    : [];
  const selectedContact = selectedPhone ? contactFor(selectedPhone) : undefined;
  const names = new Map(db.users.map((u) => [u.id, u.name]));
  const messages = [...db.whatsappMessages].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200);
  const live = whatsappConfigured();
  const template = templateConfig();

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>WhatsApp</h1>
          <p>The school&apos;s WhatsApp hub: conversations with parents and staff, announcements, and automatic replies.</p>
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

      <div className="card stack">
        <h2>Conversations</h2>
        {threadList.length === 0 ? (
          <p className="muted small">No conversations yet. Messages from parents and staff will appear here; use the test box below to try it.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(200px, 280px) 1fr", gap: "1rem" }} className="wa-inbox">
            <ul className="list" style={{ maxHeight: 520, overflowY: "auto" }}>
              {threadList.map((t) => {
                const c = contactFor(t.phone);
                return (
                  <li key={t.phone} style={t.phone === selectedPhone ? { background: "var(--surface-2)", borderRadius: 8, padding: "0.6rem" } : { padding: "0.6rem" }}>
                    <Link href={`/whatsapp?phone=${t.phone}`} style={{ color: "inherit", display: "block" }}>
                      <strong>{c?.name ?? `+${t.phone}`}</strong>
                      <span className="small muted"> · {c ? ROLE_LABELS[c.role] : "Unknown"}</span>
                      <div className="small muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.last.direction === "outbound" ? "You: " : ""}{t.last.body.split("\n")[0]}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="stack" style={{ minWidth: 0 }}>
              <div className="small">
                <strong>{selectedContact?.name ?? `+${selectedPhone}`}</strong>
                <span className="muted"> · +{selectedPhone}{selectedContact ? ` · ${ROLE_LABELS[selectedContact.role]}` : " · not registered"}</span>
              </div>
              <ScrollToBottom className="chat-log" style={{ maxHeight: 420, background: "var(--surface-2)", borderRadius: 10, padding: "0.75rem" }}>
                {thread.map((m) => (
                  <div key={m.id} className={`bubble ${m.direction === "inbound" ? "assistant" : "user"}`} style={m.direction === "inbound" ? { background: "var(--surface)" } : undefined}>
                    {m.kind === "image" && m.factId && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/facts/${m.factId}/image`} alt="" style={{ display: "block", maxWidth: 220, maxHeight: 220, borderRadius: 6, marginBottom: 4 }} />
                    )}
                    <WaText text={m.body} />
                    <div className="small" style={{ opacity: 0.7, marginTop: 4, fontSize: "0.72rem" }}>
                      {new Date(m.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      {m.direction === "outbound" ? ` · ${m.status}${m.kind === "template" ? " · template" : ""}` : ""}
                    </div>
                  </div>
                ))}
              </ScrollToBottom>
              {selectedPhone && selectedContact && <ThreadComposer phone={selectedPhone} name={selectedContact.name.split(" ")[0]} />}
            </div>
          </div>
        )}
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
                    <td className="small">{m.direction === "outbound" ? (m.kind === "template" ? "Template" : m.kind === "image" ? "Picture" : "Text") : "—"}</td>
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
