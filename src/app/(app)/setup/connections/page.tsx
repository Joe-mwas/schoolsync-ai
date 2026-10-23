import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { listSnapshots } from "@/lib/backup";
import { backupDirectory, readDb } from "@/lib/db";
import { callbackUrls, mpesaReceiving } from "@/lib/daraja";
import { displayOrigin } from "@/lib/publicUrl";
import { countReady, setupChecklist, type ItemStatus, type SetupSection } from "@/lib/setupStatus";
import { webhookActivity } from "@/lib/webhookActivity";
import { encryptionConfigured } from "@/lib/dataCrypto";
import { offsiteConfig, readOffsiteStatus } from "@/lib/offsite";
import { CopyButton, FamilyModelPicker, GenerateKey, OffsiteBackupButton, TestButton } from "../SetupTools";
import SetupTabs from "../SetupTabs";

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

export default async function ConnectionsPage() {
  const me = await requireUser(["admin"]);
  const snapshots = await listSnapshots(backupDirectory());
  const sections = setupChecklist(process.env, { lastBackupAt: snapshots[0]?.createdAt ?? null });
  const { ready, total } = countReady(sections);
  const webhookUrl = `${displayOrigin(await headers())}/api/whatsapp/webhook`;
  const activity = webhookActivity();
  const [basics, ai, whatsapp, mpesa] = sections;
  const encrypted = encryptionConfigured();
  const offsite = offsiteConfig();
  const offsiteStatus = await readOffsiteStatus(backupDirectory());
  const paymentsUrl = mpesaReceiving() ? callbackUrls(displayOrigin(await headers())).confirmation.replace(/\/c2b\/[^/]+\//, "/c2b/••••••/") : null;

  return (
    <div className="stack">
      <SetupTabs active="connections" />
      <div className="page-header">
        <div>
          <h1>Connections &amp; security</h1>
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

      <div className="card stack" id="security">
        <h2>Security &amp; off-site backups</h2>
        <p className="small muted">
          Keeps the school&apos;s data private if a file ever leaks, and safe if Render&apos;s disk or account is ever lost.
        </p>
        <ul className="list">
          <li className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
            <span className={encrypted ? "badge ok" : "badge urgent"} style={{ minWidth: 70, textAlign: "center" }}>{encrypted ? "Ready" : "Missing"}</span>
            <div>
              <strong>Encrypt the data and backups</strong><code className="small" style={{ marginLeft: 8 }}>DATA_ENCRYPTION_KEY</code>
              <div className="small muted">
                {encrypted
                  ? "The data file and every backup are encrypted (AES-256). Keep a safe copy of the key: a new server needs the same key to open them."
                  : "Generate a key below, save it somewhere safe, then add it in Render. Existing data and backups are encrypted on the next start."}
              </div>
            </div>
          </li>
          <li className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
            <span className={offsite ? "badge ok" : "badge urgent"} style={{ minWidth: 70, textAlign: "center" }}>{offsite ? "Ready" : "Missing"}</span>
            <div>
              <strong>Off-site storage</strong>
              <code className="small" style={{ marginLeft: 8 }}>OFFSITE_BACKUP_ENDPOINT, _BUCKET, _ACCESS_KEY_ID, _SECRET_ACCESS_KEY</code>
              <div className="small muted">
                {offsite
                  ? `Every day an encrypted copy goes to the "${offsite.bucket}" bucket.`
                  : "A storage bucket outside Render (Cloudflare R2, Backblaze B2 or Amazon S3) for a daily encrypted copy."}
              </div>
            </div>
          </li>
          {offsite && (
            <li className="small">
              Last off-site copy: <strong>{offsiteStatus.lastSuccessAt ? new Date(offsiteStatus.lastSuccessAt).toLocaleString("en-GB", { timeZone: "Africa/Nairobi" }) : "none yet"}</strong>
              {offsiteStatus.lastObject && <span className="muted"> · {offsiteStatus.lastObject}</span>}
              {offsiteStatus.lastError && <div style={{ color: "var(--danger)" }}>Last attempt failed: {offsiteStatus.lastError}</div>}
            </li>
          )}
        </ul>
        {!encrypted && <GenerateKey />}
        {offsite && encrypted && <OffsiteBackupButton />}
      </div>

      <div className="card stack">
        <h2>{ai.title}</h2>
        <p className="small muted">Powers the AI Assistant, &quot;Draft with AI&quot; on announcements, and automatic WhatsApp replies.</p>
        <Checklist section={ai} />
        <TestButton kind="ai" label="Test AI" />
        <FamilyModelPicker initial={(await readDb()).aiSettings.familyModel} />
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

      <div className="card stack">
        <h2>{mpesa.title}</h2>
        <p className="small muted">
          Records Paybill payments in the learner&apos;s fees automatically and WhatsApps the parent a receipt. Parents use the
          learner&apos;s <strong>admission number</strong> as the account number. Optional: skip this if the school doesn&apos;t use a Paybill.
        </p>
        <Checklist section={mpesa} />
        {paymentsUrl && (
          <div className="small muted">
            Safaricom will send payments to <code style={{ wordBreak: "break-all" }}>{paymentsUrl}</code> (the hidden part is your secret).
          </div>
        )}
        <div className="stack">
          <div className="small" style={{ fontWeight: 600 }}>1. Check the consumer key and secret (changes nothing)</div>
          <TestButton kind="mpesa-credentials" label="Check M-Pesa connection" />
          <div className="small" style={{ fontWeight: 600 }}>2. Tell Safaricom to send this Paybill&apos;s payments here</div>
          <TestButton kind="mpesa-register" label="Register with Safaricom" />
          <div className="small muted">
            Register once, and again only if the site address or secret changes. Then try a small payment, or use{" "}
            <strong>Test a payment</strong> on the Fees page.
          </div>
        </div>
      </div>
    </div>
  );
}
