"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { defaultDesign, POSTER_HEIGHT, POSTER_WIDTH, renderPoster, TEMPLATES } from "@/lib/poster";
import type { Poster, PosterDesign } from "@/lib/types";

type Audience = "everyone" | "families" | "staff";
const AUDIENCES: Record<Audience, { label: string; roles: string[] }> = {
  everyone: { label: "Everyone (staff, parents and learners)", roles: ["teacher", "parent", "student"] },
  families: { label: "Parents and learners", roles: ["parent", "student"] },
  staff: { label: "Staff only", roles: ["teacher"] },
};

export default function Designer({ initialPosters, classes = [], classRequired = false }: { initialPosters: Poster[]; classes?: { id: string; name: string }[]; classRequired?: boolean }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [posters, setPosters] = useState(initialPosters);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [name, setName] = useState("Sports day poster");
  const [design, setDesign] = useState<PosterDesign>(defaultDesign());
  const [status, setStatus] = useState<string | null>(null);
  const [share, setShare] = useState<{ audience: Audience; classId: string; message: string } | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) renderPoster(ctx, design);
  }, [design]);

  const set = <K extends keyof PosterDesign>(key: K, value: PosterDesign[K]) => setDesign((d) => ({ ...d, [key]: value }));

  function pickTemplate(t: string) {
    setDesign((d) => ({ ...d, template: t, ...TEMPLATES[t].defaults }));
  }

  function load(p: Poster) {
    setCurrentId(p.id);
    setName(p.name);
    setDesign(p.design);
    setStatus(null);
  }

  function startNew() {
    setCurrentId(null);
    setName("New poster");
    setDesign(defaultDesign(design.template));
    setStatus(null);
  }

  async function save(): Promise<string | null> {
    setStatus("Saving…");
    const res = await fetch("/api/posters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: currentId, name, design }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(data.error ?? "Save failed");
      return null;
    }
    const saved: Poster = data.poster;
    setCurrentId(saved.id);
    setPosters((list) => [...list.filter((p) => p.id !== saved.id), saved]);
    setStatus("Saved");
    router.refresh();
    return saved.id;
  }

  function startShare() {
    setShare({ audience: "everyone", classId: classRequired ? classes[0]?.id ?? "" : "", message: [design.subtitle, design.body].filter((x) => x.trim()).join("\n") });
    setStatus(null);
  }

  /** Save the poster, then post it as an announcement: it shows on everyone's dashboard and their phones are notified. */
  async function publish() {
    if (!share) return;
    setSharing(true);
    const posterId = await save();
    if (!posterId) return setSharing(false);
    const res = await fetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: design.title.trim() || name.trim() || "New poster",
        body: share.message.trim() || design.title.trim() || name.trim(),
        audience: AUDIENCES[share.audience].roles,
        classId: share.classId || null,
        priority: "normal",
        posterId,
        sendWhatsApp: false,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSharing(false);
    if (!res.ok) return setStatus(data.error ?? "Couldn't share it");
    setShare(null);
    setStatus("Shared ✅ It's on the noticeboard of everyone you chose, and their phones are notified.");
  }

  async function remove(id: string) {
    if (!confirm("Delete this poster?")) return;
    const res = await fetch(`/api/posters/${id}`, { method: "DELETE" });
    if (res.ok) {
      setPosters((list) => list.filter((p) => p.id !== id));
      if (currentId === id) startNew();
    }
  }

  function download() {
    const url = canvasRef.current?.toDataURL("image/png");
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/[^\w-]+/g, "-").toLowerCase() || "poster"}.png`;
    a.click();
  }

  return (
    <div className="designer">
      <div className="card stack">
        <label>
          Poster name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div>
          <div className="small" style={{ fontWeight: 600, marginBottom: 6 }}>Template</div>
          <div className="template-picker">
            {Object.entries(TEMPLATES).map(([key, t]) => (
              <button
                key={key}
                type="button"
                className={`secondary ${design.template === key ? "selected" : ""}`}
                onClick={() => pickTemplate(key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <label>
          Title
          <input value={design.title} onChange={(e) => set("title", e.target.value)} />
        </label>
        <label>
          Subtitle / date
          <input value={design.subtitle} onChange={(e) => set("subtitle", e.target.value)} />
        </label>
        <label>
          Details
          <textarea value={design.body} onChange={(e) => set("body", e.target.value)} rows={5} />
        </label>
        <label>
          Footer
          <input value={design.footer} onChange={(e) => set("footer", e.target.value)} />
        </label>
        <div className="grid grid-3">
          <label>
            Background
            <input type="color" value={design.background} onChange={(e) => set("background", e.target.value)} />
          </label>
          <label>
            Accent
            <input type="color" value={design.accent} onChange={(e) => set("accent", e.target.value)} />
          </label>
          <label>
            Text
            <input type="color" value={design.textColor} onChange={(e) => set("textColor", e.target.value)} />
          </label>
        </div>
        <div className="row">
          <button onClick={save}>{currentId ? "Save changes" : "Save poster"}</button>
          <button className="secondary" onClick={startShare} id="share-poster">Share on the noticeboard</button>
          <button className="secondary" onClick={download}>Download PNG</button>
          <button className="secondary" onClick={startNew}>New</button>
        </div>
        {share && (
          <form className="share-poster stack" onSubmit={(e) => { e.preventDefault(); publish(); }}>
            <strong>Share on the noticeboard</strong>
            <label>
              Who should see it
              <select value={share.audience} onChange={(e) => setShare({ ...share, audience: e.target.value as Audience })}>
                {Object.entries(AUDIENCES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
            {classes.length > 0 && (
              <label>
                Class
                <select value={share.classId} onChange={(e) => setShare({ ...share, classId: e.target.value })} required={classRequired}>
                  {!classRequired && <option value="">Whole school</option>}
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
            <label>
              Message with the poster
              <textarea rows={3} value={share.message} onChange={(e) => setShare({ ...share, message: e.target.value })} />
            </label>
            <div className="row" style={{ gap: 8 }}>
              <button type="submit" disabled={sharing}>{sharing ? "Sharing…" : "Share now"}</button>
              <button type="button" className="link" onClick={() => setShare(null)}>Cancel</button>
            </div>
            <span className="small muted">It appears on their dashboard noticeboard and in Announcements, and phones with notifications on get a notice. School leaders always see it.</span>
          </form>
        )}
        {status && <div className="small muted">{status}</div>}
      </div>

      <div className="stack">
        <canvas ref={canvasRef} width={POSTER_WIDTH} height={POSTER_HEIGHT} className="poster-canvas" aria-label="Poster preview" />
        {posters.length > 0 && (
          <div className="card">
            <h2>Saved posters</h2>
            <ul className="list">
              {posters.map((p) => (
                <li key={p.id} className="row" style={{ justifyContent: "space-between" }}>
                  <button className="link" onClick={() => load(p)}>
                    {p.name}
                    {p.id === currentId ? " (editing)" : ""}
                  </button>
                  <button className="danger small" onClick={() => remove(p.id)}>Delete</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
