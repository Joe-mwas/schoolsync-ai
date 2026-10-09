import type { PosterDesign } from "./types.ts";

export const POSTER_WIDTH = 1080;
export const POSTER_HEIGHT = 1350;

export const TEMPLATES: Record<string, { label: string; defaults: Pick<PosterDesign, "background" | "accent" | "textColor"> }> = {
  classic: { label: "Classic", defaults: { background: "#fdf8ef", accent: "#1f3b8f", textColor: "#1b1f2a" } },
  bold: { label: "Bold", defaults: { background: "#1f3b8f", accent: "#ffcc33", textColor: "#ffffff" } },
  event: { label: "Event", defaults: { background: "#0f5f4a", accent: "#ffb347", textColor: "#ffffff" } },
  minimal: { label: "Minimal", defaults: { background: "#ffffff", accent: "#e0475b", textColor: "#222222" } },
};

export function defaultDesign(template = "classic"): PosterDesign {
  return {
    template,
    title: "Sports Day 2026",
    subtitle: "Friday, 24 October · 9:00 AM",
    body: "Join us for a day of inter-house athletics, music and food. Parents are warmly welcome. Students should come in their house colours.",
    footer: "SchoolSync Academy",
    ...TEMPLATES[template].defaults,
  };
}

/** Greedy word wrap using the context's current font. */
export function wrapText(measure: (s: string) => number, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= maxWidth || !line) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function drawLines(ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, lineHeight: number): number {
  for (const l of lines) {
    ctx.fillText(l, x, y);
    y += lineHeight;
  }
  return y;
}

export function renderPoster(ctx: CanvasRenderingContext2D, d: PosterDesign): void {
  const W = POSTER_WIDTH;
  const H = POSTER_HEIGHT;
  const pad = 96;
  const font = (weight: number, size: number) => `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = d.background;
  ctx.fillRect(0, 0, W, H);

  // Template decoration
  ctx.fillStyle = d.accent;
  switch (d.template) {
    case "bold":
      ctx.beginPath();
      ctx.arc(W - 120, 140, 260, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(0, H - 40, W, 40);
      break;
    case "event":
      ctx.fillRect(0, 0, W, 24);
      ctx.fillRect(0, H - 24, W, 24);
      ctx.globalAlpha = 0.18;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(120 + i * 170, H - 260 + (i % 2) * 60, 70, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    case "minimal":
      ctx.fillRect(pad, pad, 120, 12);
      break;
    default:
      ctx.fillRect(0, 0, 36, H);
      ctx.fillRect(pad, 420, 160, 8);
  }

  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  const maxWidth = W - pad * 2;
  let y = d.template === "minimal" ? pad + 60 : 180;

  ctx.fillStyle = d.textColor;
  ctx.font = font(800, 104);
  y = drawLines(ctx, wrapText((s) => ctx.measureText(s).width, d.title, maxWidth), pad, y, 116);

  if (d.subtitle) {
    y += 24;
    ctx.fillStyle = d.template === "classic" || d.template === "minimal" ? d.accent : d.textColor;
    ctx.font = font(600, 48);
    y = drawLines(ctx, wrapText((s) => ctx.measureText(s).width, d.subtitle, maxWidth), pad, y, 60);
  }

  y = Math.max(y + 64, d.template === "classic" ? 470 : 0);
  ctx.fillStyle = d.textColor;
  ctx.font = font(400, 40);
  drawLines(ctx, wrapText((s) => ctx.measureText(s).width, d.body, maxWidth), pad, y, 58);

  if (d.footer) {
    ctx.font = font(700, 36);
    ctx.fillStyle = d.template === "bold" ? d.textColor : d.accent;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(d.footer, pad, H - pad);
  }
}
