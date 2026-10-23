"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DocumentCategory, SchoolDocument, SchoolProfile } from "@/lib/types";

type Msg = { ok: boolean; text: string } | null;

function Status({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return <div className={msg.ok ? "small ok-text" : "error"} role="status">{msg.ok ? "✓ " : ""}{msg.text}</div>;
}

export function ProfileForm({ profile, fallbackName }: { profile: SchoolProfile; fallbackName: string }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: profile.name || fallbackName,
    motto: profile.motto,
    website: profile.website,
    phone: profile.phone,
    email: profile.email,
    address: profile.address,
  });
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const field = (k: keyof typeof form) => ({ id: `profile-${k}`, value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }) });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/school/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: data.error ?? "Couldn't save" });
    setForm({ ...form, website: data.profile.website });
    setMsg({ ok: true, text: "Saved. The school's name now shows on the sign-in page, in WhatsApp messages and in the brief." });
    router.refresh();
  }

  return (
    <form className="stack" onSubmit={save}>
      <div className="grid grid-2">
        <label>School name<input {...field("name")} required maxLength={100} placeholder="e.g. St. Thomas Catholic Academy" /></label>
        <label>Motto (optional)<input {...field("motto")} maxLength={140} placeholder="e.g. Faith, Knowledge and Service" /></label>
        <label>Website (optional)<input {...field("website")} maxLength={200} placeholder="e.g. stthomas.ac.ke" inputMode="url" /></label>
        <label>Office phone<input {...field("phone")} maxLength={40} placeholder="e.g. 0712 345 678" inputMode="tel" /></label>
        <label>Office email<input {...field("email")} maxLength={120} placeholder="e.g. info@stthomas.ac.ke" inputMode="email" /></label>
        <label>Physical address<input {...field("address")} maxLength={200} placeholder="e.g. Ngong Road, Nairobi" /></label>
      </div>
      <Status msg={msg} />
      <div><button type="submit" disabled={busy}>{busy ? "Saving…" : "Save school details"}</button></div>
    </form>
  );
}

export function LogoUploader({ hasLogo, version }: { hasLogo: boolean; version: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    const res = await fetch("/api/school/logo", { method: "POST", body: file });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: data.error ?? "Couldn't upload the logo" });
    setMsg({ ok: true, text: "Logo saved. It now shows on the sign-in page and in the menu." });
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    await fetch("/api/school/logo", { method: "DELETE" });
    setBusy(false);
    setMsg(null);
    router.refresh();
  }

  return (
    <div className="logo-uploader">
      <div className="logo-frame">
        {hasLogo ? <img src={`/api/school/logo?v=${encodeURIComponent(version)}`} alt="School logo" /> : <span className="muted small">No logo yet</span>}
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <div className="small muted">A square PNG or JPEG works best (up to 2 MB). A transparent PNG looks best on both light and dark themes.</div>
        <div className="row">
          <label className="button secondary">
            {busy ? "Uploading…" : hasLogo ? "Replace logo" : "Upload logo"}
            <input type="file" accept="image/png,image/jpeg" onChange={upload} disabled={busy} hidden />
          </label>
          {hasLogo && <button type="button" className="link small" onClick={remove} disabled={busy}>Remove</button>}
        </div>
        <Status msg={msg} />
      </div>
    </div>
  );
}

const KB = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function DocumentsManager({ documents, categories, names }: { documents: SchoolDocument[]; categories: Record<DocumentCategory, string>; names: Record<string, string> }) {
  const router = useRouter();
  const [category, setCategory] = useState<DocumentCategory>("instructions");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) return;
    setBusy(true);
    setMsg(null);
    const failed: string[] = [];
    for (const f of files) {
      const body = new FormData();
      body.set("file", f);
      body.set("category", category);
      body.set("note", note);
      if (files.length === 1) body.set("title", title);
      const res = await fetch("/api/documents", { method: "POST", body });
      if (!res.ok) failed.push(`${f.name}: ${((await res.json().catch(() => ({}))) as { error?: string }).error ?? "failed"}`);
    }
    setBusy(false);
    const saved = files.length - failed.length;
    setMsg(failed.length ? { ok: false, text: `${saved ? `${saved} saved. ` : ""}${failed.join("; ")}` } : { ok: true, text: `${saved} document${saved === 1 ? "" : "s"} saved.` });
    if (!failed.length) {
      setFiles([]);
      setTitle("");
      setNote("");
    }
    router.refresh();
  }

  async function remove(id: string) {
    setConfirming(null);
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  const grouped = (Object.keys(categories) as DocumentCategory[]).map((c) => ({ c, docs: documents.filter((d) => d.category === c) })).filter((g) => g.docs.length);

  return (
    <div className="stack">
      <form className="stack" onSubmit={upload}>
        <label
          className={`dropzone${dragging ? " is-over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); setFiles([...e.dataTransfer.files]); }}
        >
          <input type="file" multiple hidden onChange={(e) => setFiles([...(e.target.files ?? [])])} />
          <strong>{files.length ? files.map((f) => f.name).join(", ") : "Drop files here, or click to choose"}</strong>
          <span className="small muted">PDF, Word, Excel, PowerPoint, CSV, text or pictures · up to 15 MB each</span>
        </label>
        <div className="grid grid-3">
          <label>Type of document
            <select id="doc-category" value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)}>
              {(Object.entries(categories) as [DocumentCategory, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>Title (optional)<input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={files.length > 1 ? "Uses each file's name" : "e.g. Director's term 3 instructions"} disabled={files.length > 1} /></label>
          <label>Note (optional)<input id="doc-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. Received from the principal, 23 Oct" /></label>
        </div>
        <Status msg={msg} />
        <div><button type="submit" disabled={busy || files.length === 0}>{busy ? "Uploading…" : `Upload ${files.length > 1 ? `${files.length} files` : "document"}`}</button></div>
      </form>

      {grouped.length === 0 ? (
        <p className="small muted" style={{ margin: 0 }}>No documents yet. The director&apos;s instructions, policies, fee structures and class lists you collect at the school go here.</p>
      ) : (
        grouped.map(({ c, docs }) => (
          <div key={c} className="stack" style={{ gap: 6 }}>
            <h3 style={{ margin: 0 }}>{categories[c]} <span className="muted small">({docs.length})</span></h3>
            <ul className="list">
              {docs.map((d) => (
                <li key={d.id} className="row doc-row">
                  <span className="doc-kind">{d.kind}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <strong>{d.title}</strong>
                    <div className="small muted">{d.fileName} · {KB(d.size)} · {new Date(d.uploadedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · by {names[d.uploadedBy] ?? "—"}</div>
                    {d.note && <div className="small">{d.note}</div>}
                  </div>
                  <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                    <a className="button secondary small" href={`/api/documents/${d.id}`}>Download</a>
                    {confirming === d.id ? (
                      <>
                        <button className="danger small" onClick={() => remove(d.id)}>Delete</button>
                        <button className="link small" onClick={() => setConfirming(null)}>Keep</button>
                      </>
                    ) : (
                      <button className="link small" onClick={() => setConfirming(d.id)}>Remove</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
