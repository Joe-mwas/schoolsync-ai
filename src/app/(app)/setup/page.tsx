import Link from "next/link";
import { aiConfigured, schoolName } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { encryptionConfigured } from "@/lib/dataCrypto";
import { readDb } from "@/lib/db";
import { offsiteConfig } from "@/lib/offsite";
import { DOCUMENT_CATEGORIES } from "@/lib/types";
import { whatsappConfigured } from "@/lib/whatsapp";
import ImportCard from "../school/ImportCard";
import { DocumentsManager, LogoUploader, ProfileForm } from "./OnboardingForms";
import SetupTabs from "./SetupTabs";

interface Step {
  label: string;
  detail: string;
  done: boolean;
  href: string;
  optional?: boolean;
}

/** Onboarding a school: its details and logo, its learners, its documents, and what's still to do. */
export default async function OnboardingPage() {
  await requireUser(["admin"]);
  const db = await readDb();
  const count = (role: string) => db.users.filter((u) => u.role === role).length;
  const p = db.profile;
  const steps: Step[] = [
    { label: "School details", detail: p.name ? p.name : "Name, contacts and website", done: Boolean(p.name && (p.phone || p.email)), href: "#profile" },
    { label: "School logo", detail: p.logo ? "Uploaded" : "Shows on sign-in and in the menu", done: Boolean(p.logo), href: "#profile" },
    { label: "Classes and learners", detail: count("student") ? `${count("student")} learner${count("student") === 1 ? "" : "s"} in ${db.classes.length} class${db.classes.length === 1 ? "" : "es"}` : "Upload the class list (Excel or CSV)", done: count("student") > 0, href: "#students" },
    { label: "Teachers and staff", detail: count("teacher") ? `${count("teacher")} teachers` : "Add them in School Admin", done: count("teacher") > 0, href: "/school" },
    { label: "Term fees", detail: db.fees.some((f) => f.kind === "charge") ? "Fees set" : "Set fees or upload the fees sheet", done: db.fees.some((f) => f.kind === "charge"), href: "/fees" },
    { label: "School facts", detail: db.facts.length ? `${db.facts.length} facts for the AI` : "Uniform, term dates, how to pay…", done: db.facts.length > 0, href: "/facts" },
    { label: "Documents", detail: db.documents.length ? `${db.documents.length} on file` : "Instructions, policies, fee structures", done: db.documents.length > 0, href: "#documents", optional: true },
    { label: "Claude AI", detail: aiConfigured() ? "Connected" : "Add the API key", done: aiConfigured(), href: "/setup/connections" },
    { label: "WhatsApp", detail: whatsappConfigured() ? "Connected" : "Connect Meta WhatsApp", done: whatsappConfigured(), href: "/setup/connections" },
    { label: "Data encryption", detail: encryptionConfigured() ? "On" : "Add the encryption key", done: encryptionConfigured(), href: "/setup/connections#security" },
    { label: "Off-site backup", detail: offsiteConfig() ? "Daily copy on" : "Connect Cloudflare R2", done: Boolean(offsiteConfig()), href: "/setup/connections#security" },
  ];
  const required = steps.filter((s) => !s.optional);
  const done = required.filter((s) => s.done).length;
  const pct = Math.round((done / required.length) * 100);
  const names = Object.fromEntries(db.users.map((u) => [u.id, u.name]));

  return (
    <div className="stack">
      <SetupTabs active="onboarding" />
      <div className="page-header">
        <div>
          <h1>Onboarding</h1>
          <p>Everything a new school needs, in one place: its details and logo, learners, documents, and the connections still to set up.</p>
        </div>
      </div>

      <section className="card stack onboarding-progress" aria-labelledby="progress-title">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <h2 id="progress-title" style={{ margin: 0 }}>{p.name || schoolName()}</h2>
            <div className="small muted">{done} of {required.length} steps done</div>
          </div>
          <strong className="progress-figure">{pct}%</strong>
        </div>
        <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Onboarding progress"><span style={{ width: `${pct}%` }} /></div>
        <ul className="steps">
          {steps.map((s) => (
            <li key={s.label}>
              <Link href={s.href} className={`step${s.done ? " is-done" : ""}`}>
                <span className="step-mark" aria-hidden="true">{s.done ? "✓" : ""}</span>
                <span className="step-text">
                  <strong>{s.label}{s.optional ? <span className="muted small"> · optional</span> : null}</strong>
                  <span className="small muted">{s.detail}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="card stack" id="profile">
        <h2 style={{ margin: 0 }}>School details and logo</h2>
        <LogoUploader hasLogo={Boolean(p.logo)} version={p.logo?.file ?? ""} />
        <ProfileForm profile={p} fallbackName={process.env.SCHOOL_NAME?.trim() ?? ""} />
        {p.website && (
          <div className="small">Website: <a href={p.website} target="_blank" rel="noopener noreferrer">{p.website.replace(/^https?:\/\//, "")} ↗</a></div>
        )}
      </section>

      <div id="students">
        <ImportCard />
      </div>

      <section className="card stack" id="documents">
        <div>
          <h2 style={{ margin: 0 }}>Documents</h2>
          <p className="small muted" style={{ margin: "4px 0 0" }}>
            Keep what the school gives you during onboarding: the director&apos;s or principal&apos;s instructions, policies, fee
            structures and class lists. Only the administrator can see them{encryptionConfigured() ? ", and they're stored encrypted" : ""}.
            To load learners from a class list, use <a href="#students">Import from a spreadsheet</a> above.
          </p>
        </div>
        <DocumentsManager documents={[...db.documents].reverse()} categories={DOCUMENT_CATEGORIES} names={names} />
      </section>
    </div>
  );
}
