"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { defaultDesign, POSTER_HEIGHT, POSTER_WIDTH, renderPoster, TEMPLATES } from "@/lib/poster";
import type { Poster, PosterDesign } from "@/lib/types";

export default function Designer({ initialPosters }: { initialPosters: Poster[] }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [posters, setPosters] = useState(initialPosters);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [name, setName] = useState("Sports day poster");
  const [design, setDesign] = useState<PosterDesign>(defaultDesign());
  const [status, setStatus] = useState<string | null>(null);

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

  async function save() {
    setStatus("Saving…");
    const res = await fetch("/api/posters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: currentId, name, design }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(data.error ?? "Save failed");
      return;
    }
    const saved: Poster = data.poster;
    setCurrentId(saved.id);
    setPosters((list) => [...list.filter((p) => p.id !== saved.id), saved]);
    setStatus("Saved");
    router.refresh();
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
          <button className="secondary" onClick={download}>Download PNG</button>
          <button className="secondary" onClick={startNew}>New</button>
        </div>
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
