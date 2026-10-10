import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { listSnapshots } from "@/lib/backup";
import { backupDirectory } from "@/lib/db";
import { displayOrigin } from "@/lib/publicUrl";
import { countReady, setupChecklist, type ItemStatus, type SetupSection } from "@/lib/setupStatus";
import { webhookActivity } from "@/lib/webhookActivity";
import { CopyButton, TestButton } from "./SetupTools";

const PILL: Record<ItemStatus, { label: string; className: string }> = {
  ok: { label: "Ready", className: "badge ok" },
  missing: { label: "Missing", className: "badge urgent" },
  warn: { label: "Check", className: "badge urgent" },
  optional: { label: "Optional", className: "badge" },
};

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("en-GB") : "not since the app last restarted";
}

function Checklist({ section }: { section: SetupSection }) {
  return (
    <ul className="list">
      {section.items.map((item) => (
        <li key={item.id} className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
          <span className={PILL[item.status].className} style={{ minWidth: 70, textAlign: "center" }}>{PILL[item.status].label}</span>
          <div>
            <strong>{item.label}</strong>
            {item.envVar && <code className="small" style={{ marginLeft: 8 }}>{item.envVar}</code>}
            <div className="small muted">{item.detail}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function SetupPage() {
  const me = await requireUser(["director"]);
  const snapshots = await listSnapshots(backupDirectory());
  const sections = setupChecklist(process.env, { lastBackupAt: snapshots[0]?.createdAt ?? null });
  const { ready, total } = countReady(sections);
  const webhookUrl = `${displayOrigin(await headers())}/api/whatsapp/webhook`;
  const activity = webhookActivity();
  const [basics, ai, whatsapp] = sections;

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>Setup</h1>
          <p>What&apos;s connected, what&apos;s missing, and buttons to test each connection.</p>
        </div>
        <span className={`badge ${ready === total ? "ok" : "urgent"}`}>{ready} of {total} required items ready</span>
      </div>

      <div className="notice" style={{ background: "var(--surface-2)", color: "var(--text)" }}>
        <strong>To change a setting:</strong> in Render open <strong>schoolsync-ai → Environment</strong>, add or edit the setting
        named below, click <strong>Save Changes</strong>, wait until the new deploy says <strong>Live</strong> (about 2–5 minutes),
        then reload this page. Never paste keys or secrets into chats or emails.
      </div>

      <div className="card stack">
        <h2>{basics.title}</h2>
        <Checklist section={basics} />
      </div>

      <div className="card stack">
        <h2>{ai.title}</h2>
        <p className="small muted">Powers the AI Assistant, &quot;Draft with AI&quot; on announcements, and automatic WhatsApp replies.</p>
        <Checklist section={ai} />
        <TestButton kind="ai" label="Test AI" />
      </div>

      <div className="card stack">
        <h2>{whatsapp.title}</h2>
        <p className="small muted">Sends announcements to parents&apos; phones and lets the assistant answer their messages.</p>
        <Checklist section={whatsapp} />

        <div className="stack" style={{ background: "var(--surface-2)", padding: "0.75rem", borderRadius: 8 }}>
          <div className="small" style={{ fontWeight: 600 }}>Webhook address (paste into Meta → WhatsApp → Configuration → Callback URL)</div>
          <div className="row">
            <code style={{ wordBreak: "break-all" }}>{webhookUrl}</code>
            <CopyButton text={webhookUrl} />
          </div>
          <div className="small muted">
            Then type your <code>WHATSAPP_VERIFY_TOKEN</code> phrase as the Verify token, click Verify and save, and subscribe to{" "}
            <strong>messages</strong>.
          </div>
          <div className="small muted">
            Meta last verified the webhook: {when(activity.verifiedAt)}. Meta last delivered a message or receipt: {when(activity.receivedAt)}.
          </div>
        </div>

        <div className="stack">
          <div className="small" style={{ fontWeight: 600 }}>1. Check the access token and phone number ID (sends nothing)</div>
          <TestButton kind="whatsapp-credentials" label="Check WhatsApp connection" />
          <div className="small" style={{ fontWeight: 600 }}>2. Check the webhook answers Meta correctly</div>
          <TestButton kind="webhook" label="Test webhook" />
          <div className="small" style={{ fontWeight: 600 }}>3. Send a real test message</div>
          <TestButton kind="whatsapp-send" label="Send test WhatsApp" defaultPhone={me.phone ?? ""} />
          <div className="small muted">
            On Meta&apos;s free test number, the phone must first be added under API Setup → To. For normal messages the person must
            have messaged the school in the last 24 hours.
          </div>
        </div>
      </div>
    </div>
  );
}
