import Link from "next/link";
import { filterAiLogs, type AiLogFilter } from "@/lib/aiLog";
import { requireUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/permissions";
import type { AiChannel } from "@/lib/types";
import ReviewActions from "./ReviewActions";

const PAGE_SIZE = 30;
const CHANNELS: Record<AiChannel, string> = { assistant: "AI Assistant", whatsapp: "WhatsApp reply", draft: "Draft with AI", brief: "Director's brief" };

type Search = { show?: string; channel?: string; q?: string; page?: string };

export default async function AiReviewPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireUser(["admin"]);
  const sp = await searchParams;
  const db = await readDb();
  const users = new Map(db.users.map((u) => [u.id, u]));
  const factTitles = new Map(db.facts.map((f) => [f.id, f.title]));
  const nameOf = (id: string | null) => (id ? users.get(id)?.name ?? "Removed user" : "Unknown");

  const filter: AiLogFilter = {
    show: sp.show === "flagged" || sp.show === "unreviewed" ? sp.show : "all",
    channel: sp.channel && sp.channel in CHANNELS ? (sp.channel as AiChannel) : "",
    q: sp.q ?? "",
  };
  const all = filterAiLogs(db.aiLogs, filter, nameOf);
  const page = Math.max(1, Number(sp.page) || 1);
  const shown = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));

  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const stats = {
    week: db.aiLogs.filter((l) => l.createdAt >= weekAgo).length,
    flagged: db.aiLogs.filter((l) => l.flagged).length,
    unreviewed: db.aiLogs.filter((l) => !l.reviewedAt).length,
  };
  const link = (over: Partial<Search>) => {
    const params = new URLSearchParams();
    const merged = { show: filter.show, channel: filter.channel, q: filter.q, ...over };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "show" && v === "all")) params.set(k, String(v));
    const qs = params.toString();
    return `/ai-review${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>AI Review</h1>
          <p>
            Every question asked to the AI and what it answered. Flag wrong answers, then use <strong>Save as school fact</strong> so the AI
            gets it right from then on.
          </p>
        </div>
      </div>

      <div className="grid grid-3">
        <div className="card"><div className="stat-label">Questions in the last 7 days</div><div className="stat-value">{stats.week}</div></div>
        <Link href={link({ show: "unreviewed", page: undefined })} className="card" style={{ color: "inherit" }}>
          <div className="stat-label">Not reviewed yet</div><div className="stat-value">{stats.unreviewed}</div>
        </Link>
        <Link href={link({ show: "flagged", page: undefined })} className="card" style={{ color: "inherit" }}>
          <div className="stat-label">Flagged as wrong</div><div className="stat-value">{stats.flagged}</div>
        </Link>
      </div>

      <form className="card row" method="get" action="/ai-review">
        <label className="row" style={{ flexDirection: "row", alignItems: "center", gap: "0.4rem" }}>
          Show
          <select name="show" defaultValue={filter.show}>
            <option value="all">All</option>
            <option value="unreviewed">Not reviewed</option>
            <option value="flagged">Flagged</option>
          </select>
        </label>
        <label className="row" style={{ flexDirection: "row", alignItems: "center", gap: "0.4rem" }}>
          From
          <select name="channel" defaultValue={filter.channel}>
            <option value="">Everywhere</option>
            {Object.entries(CHANNELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <input name="q" defaultValue={filter.q} placeholder="Search questions, answers, names…" style={{ flex: 1, minWidth: 200 }} />
        <button type="submit">Filter</button>
      </form>

      {shown.length === 0 && (
        <p className="muted">
          {db.aiLogs.length === 0
            ? "No AI conversations yet. They appear here as soon as someone uses the AI Assistant, Draft with AI, or messages the school on WhatsApp."
            : "Nothing matches this filter."}
        </p>
      )}

      {shown.map((l) => {
        const who = l.userId ? users.get(l.userId) : undefined;
        return (
          <article key={l.id} className={`card stack ${l.flagged ? "announcement urgent" : ""}`} style={{ gap: "0.6rem" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="small">
                <strong>{who?.name ?? nameOf(l.userId)}</strong>
                {who && <span className="muted"> · {ROLE_LABELS[who.role]}</span>}
                <span className="muted"> · {new Date(l.createdAt).toLocaleString("en-GB")}</span>
              </div>
              <div className="row" style={{ gap: "0.4rem" }}>
                <span className="badge">{CHANNELS[l.channel]}</span>
                {l.flagged ? <span className="badge urgent">Flagged</span> : l.reviewedAt ? <span className="badge ok">Reviewed</span> : null}
              </div>
            </div>
            <div className="bubble user" style={{ maxWidth: "100%", alignSelf: "flex-start" }}>{l.question}</div>
            <div className="bubble assistant" style={{ maxWidth: "100%" }}>{l.answer}</div>
            {l.flagged && l.note && <div className="small"><strong>Your note:</strong> {l.note}</div>}
            <div className="row" style={{ justifyContent: "space-between" }}>
              <ReviewActions id={l.id} flagged={Boolean(l.flagged)} reviewed={Boolean(l.reviewedAt)} />
              {l.factId && factTitles.has(l.factId) ? (
                <Link href="/facts" className="small">✓ Corrected with the fact &quot;{factTitles.get(l.factId)}&quot;</Link>
              ) : (
                (l.flagged || l.channel !== "brief") && (
                  <Link href={`/facts?fromLog=${l.id}`} className={`button small ${l.flagged ? "" : "secondary"}`}>Save as school fact</Link>
                )
              )}
            </div>
          </article>
        );
      })}

      {pages > 1 && (
        <div className="row" style={{ justifyContent: "center" }}>
          {page > 1 && <Link className="button secondary" href={link({ page: String(page - 1) })}>← Newer</Link>}
          <span className="small muted">Page {page} of {pages}</span>
          {page < pages && <Link className="button secondary" href={link({ page: String(page + 1) })}>Older →</Link>}
        </div>
      )}
    </div>
  );
}
