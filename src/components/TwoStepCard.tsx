"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import PasswordInput from "./PasswordInput";

/**
 * Two-step sign-in for a staff account: scan a QR code with an authenticator
 * app, confirm with the first code, keep the backup codes. Also shown in
 * place of the page when the school requires it and it isn't set up yet.
 */

interface Props {
  enabled: boolean;
  enabledAt?: string | null;
  backupLeft?: number;
  /** The school requires it for staff (so it can't be turned off). */
  required: boolean;
  /** Shown instead of the page until it's set up. */
  forced?: boolean;
}

type Setup = { qr: string; key: string; url: string };

async function call(body: Record<string, string>) {
  const res = await fetch("/api/account/two-step", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong; try again.");
  return data;
}

export default function TwoStepCard({ enabled, enabledAt, backupLeft = 0, required, forced = false }: Props) {
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [ask, setAsk] = useState<"off" | "codes" | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const start = () => run(async () => {
    setSetup(await call({ action: "start" }));
    setCode("");
  });
  const confirm = () => run(async () => {
    const data = await call({ action: "confirm", code });
    setSetup(null);
    setCodes(data.backupCodes);
  });
  const withPassword = () => run(async () => {
    const data = await call({ action: ask!, password });
    setAsk(null);
    setPassword("");
    if (data.backupCodes) setCodes(data.backupCodes);
    else router.refresh();
  });

  const title = forced ? "Your school requires two-step sign-in" : "Two-step sign-in";

  if (codes) {
    return (
      <section className="card stack two-step" aria-labelledby="two-step-title">
        <h2 id="two-step-title" style={{ margin: 0 }}>Save your backup codes</h2>
        <p className="small muted" style={{ margin: 0 }}>
          If you lose your phone, each of these codes lets you sign in once instead of the app&apos;s code. Write them down or
          save them somewhere safe. <strong>They won&apos;t be shown again.</strong>
        </p>
        <ul className="backup-codes">{codes.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="secondary small" onClick={async () => {
            try {
              await navigator.clipboard.writeText(codes.join("\n"));
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}>{copied ? "Copied ✓" : "Copy all"}</button>
          <button type="button" className="small" onClick={() => { setCodes(null); router.refresh(); }}>I&apos;ve saved them</button>
        </div>
      </section>
    );
  }

  if (setup) {
    return (
      <section className="card stack two-step" aria-labelledby="two-step-title">
        <h2 id="two-step-title" style={{ margin: 0 }}>{title}</h2>
        <ol className="two-step-steps">
          <li>On your phone, install <strong>Google Authenticator</strong> or <strong>Microsoft Authenticator</strong> (both free).</li>
          <li>
            In the app, tap <strong>+</strong> then <strong>Scan a QR code</strong>, and scan this:
            <div className="qr" aria-label="QR code for your authenticator app" role="img" dangerouslySetInnerHTML={{ __html: setup.qr }} />
            <div className="small muted">
              Can&apos;t scan? Choose <strong>Enter a setup key</strong> and type <code className="setup-key">{setup.key}</code>
              {" "}· On this phone? <a href={setup.url}>Open in the app</a>
            </div>
          </li>
          <li>Type the 6-digit code the app shows:</li>
        </ol>
        <form className="row" style={{ gap: 8, alignItems: "flex-end" }} onSubmit={(e) => { e.preventDefault(); confirm(); }}>
          <label style={{ flex: "0 1 180px" }}>
            Code
            <input id="two-step-code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" required />
          </label>
          <button type="submit" disabled={busy || code.replace(/\s/g, "").length !== 6}>{busy ? "Checking…" : "Turn on"}</button>
          <button type="button" className="link" onClick={() => { setSetup(null); setError(null); }}>Cancel</button>
        </form>
        {error && <div className="error">{error}</div>}
      </section>
    );
  }

  return (
    <section className="card stack two-step" aria-labelledby="two-step-title">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 id="two-step-title" style={{ margin: 0 }}>{title}</h2>
        <span className={`badge ${enabled ? "ok" : required ? "urgent" : ""}`}>{enabled ? "On" : "Off"}</span>
      </div>
      {enabled ? (
        <p className="small muted" style={{ margin: 0 }}>
          After your password, you also type the 6-digit code from your phone&apos;s authenticator app, so a stolen password
          alone can&apos;t open your account.
          {enabledAt && <> On since {new Date(enabledAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.</>}
          {" "}{backupLeft} backup code{backupLeft === 1 ? "" : "s"} left.
        </p>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          {forced
            ? "Before you continue, connect your phone. It takes about a minute: you'll need a free authenticator app. After this, signing in asks for your password and a 6-digit code from the app."
            : "Protect your account: after your password, you'll also type a 6-digit code from a free authenticator app on your phone. A stolen password alone can't open your account."}
        </p>
      )}

      {ask ? (
        <form className="row" style={{ gap: 8, alignItems: "flex-end" }} onSubmit={(e) => { e.preventDefault(); withPassword(); }}>
          <label style={{ flex: "1 1 220px" }}>
            Your password
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          </label>
          <button type="submit" className={ask === "off" ? "danger" : ""} disabled={busy || !password}>
            {busy ? "Checking…" : ask === "off" ? "Turn off" : "Make new codes"}
          </button>
          <button type="button" className="link" onClick={() => { setAsk(null); setPassword(""); setError(null); }}>Cancel</button>
        </form>
      ) : (
        <div className="row" style={{ gap: 8 }}>
          {enabled ? (
            <>
              <button type="button" className="secondary small" disabled={busy} onClick={start}>Set up on a new phone</button>
              <button type="button" className="secondary small" disabled={busy} onClick={() => setAsk("codes")}>New backup codes</button>
              {!required && <button type="button" className="secondary small" disabled={busy} onClick={() => setAsk("off")}>Turn off</button>}
            </>
          ) : (
            <button type="button" id="two-step-start" disabled={busy} onClick={start}>{busy ? "Starting…" : "Set up two-step sign-in"}</button>
          )}
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </section>
  );
}
