"use client";

import { useEffect, useRef, useState } from "react";

/*
 * Small, dependency-free SVG charts for the dashboards. Colours come from the
 * .viz tokens in globals.css (validated for both themes and colour-blind
 * readers); every value is also in the "Show table" view, so hovering is
 * never the only way to read a number.
 */

export interface LegendItem {
  label: string;
  color: string;
  kind?: "rect" | "line";
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    setWidth(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Round axis ticks: 0 and 3–5 clean steps up to at least `max`. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => Math.round(i * step * 100) / 100);
}

export function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${+(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 1_000) return `${+(n / 1_000).toFixed(a >= 10_000 ? 0 : 1)}K`;
  return String(Math.round(n));
}

/** A bar with a 4px rounded data end and a square baseline end. */
function barPath(x: number, y: number, w: number, h: number, dir: "up" | "right"): string {
  const r = Math.min(4, dir === "up" ? h : w, dir === "up" ? w / 2 : h / 2);
  if (r <= 0) return "";
  if (dir === "up") return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
  return `M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z`;
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: React.ReactNode }) {
  const left = Math.max(70, Math.min(width - 70, x));
  return (
    <div className="viz-tip" style={{ left, top: y }} role="status">
      {children}
    </div>
  );
}

export function ChartCard({
  title,
  subtitle,
  headline,
  legend,
  table,
  children,
}: {
  title: string;
  subtitle?: string;
  headline?: { value: string; label: string };
  legend?: LegendItem[];
  table: { columns: string[]; rows: string[][] };
  children: React.ReactNode;
}) {
  return (
    <section className="card viz">
      <header className="viz-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="viz-sub">{subtitle}</p>}
        </div>
        {headline && (
          <div className="viz-headline">
            <strong>{headline.value}</strong>
            <span>{headline.label}</span>
          </div>
        )}
      </header>
      {legend && legend.length > 1 && (
        <ul className="viz-legend">
          {legend.map((l) => (
            <li key={l.label}>
              <span className={l.kind === "line" ? "viz-key-line" : "viz-key"} style={{ background: l.color }} />
              {l.label}
            </li>
          ))}
        </ul>
      )}
      {children}
      <details className="viz-table">
        <summary>Show as a table</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>{table.columns.map((c) => <th key={c}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>{r.map((v, j) => <td key={j}>{v}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

/** One series of columns over time (e.g. fees collected per month). */
export function ColumnChart({
  data,
  format,
  color = "var(--viz-1)",
  height = 220,
  detail,
}: {
  data: { label: string; value: number }[];
  format: (v: number) => string;
  color?: string;
  height?: number;
  detail?: (i: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const m = { top: 22, right: 8, bottom: 26, left: 44 };
  const iw = Math.max(0, width - m.left - m.right);
  const ih = height - m.top - m.bottom;
  const ticks = niceTicks(Math.max(...data.map((d) => d.value), 0));
  const top = ticks[ticks.length - 1] || 1;
  const band = data.length ? iw / data.length : 0;
  const bw = Math.min(24, band * 0.6);
  const every = band >= 34 ? 1 : band >= 18 ? 2 : 3;
  const yOf = (v: number) => m.top + ih - (v / top) * ih;
  const last = data.length - 1;

  return (
    <div ref={ref} className="viz-plot">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Column chart">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={width - m.right} y1={yOf(t)} y2={yOf(t)} className={t === 0 ? "viz-base" : "viz-grid"} />
              <text x={m.left - 8} y={yOf(t)} className="viz-tick" textAnchor="end" dominantBaseline="middle">{compact(t)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = m.left + band * i + band / 2;
            const h = (d.value / top) * ih;
            return (
              <g key={d.label + i}>
                <path d={barPath(cx - bw / 2, m.top + ih - h, bw, h, "up")} fill={color} opacity={hover === null || hover === i ? 1 : 0.55} />
                {((i % every === 0 && last - i >= every) || i === last) && (
                  <text x={cx} y={height - 8} className="viz-tick" textAnchor="middle">{d.label}</text>
                )}
                {i === last && d.value > 0 && (
                  <text x={cx} y={m.top + ih - h - 6} className="viz-value" textAnchor="middle">{compact(d.value)}</text>
                )}
                <rect
                  x={m.left + band * i}
                  y={m.top}
                  width={band}
                  height={ih}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${d.label}: ${format(d.value)}`}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                />
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <Tooltip x={m.left + band * hover + band / 2} y={yOf(data[hover].value) - 8} width={width}>
          <strong>{format(data[hover].value)}</strong>
          <span>{data[hover].label}{detail ? ` · ${detail(hover)}` : ""}</span>
        </Tooltip>
      )}
    </div>
  );
}

function splitLabel(s: string): [string, string] {
  if (s.length <= 12) return [s, ""];
  const words = s.split(" ");
  let a = "";
  while (words.length && (a + " " + words[0]).trim().length <= Math.ceil(s.length / 2) + 4) a = `${a} ${words.shift()}`.trim();
  return [a || s, words.join(" ")];
}

/** One percentage line across exams (e.g. share of learners meeting expectations). */
export function LineChart({
  data,
  color = "var(--viz-1)",
  height = 230,
  detail,
}: {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
  detail?: (i: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const m = { top: 18, right: 40, bottom: 40, left: 40 };
  const iw = Math.max(0, width - m.left - m.right);
  const ih = height - m.top - m.bottom;
  const step = data.length > 1 ? iw / (data.length - 1) : 0;
  const xOf = (i: number) => (data.length > 1 ? m.left + step * i : m.left + iw / 2);
  const yOf = (v: number) => m.top + ih - (v / 100) * ih;
  const pts = data.map((d, i) => [xOf(i), yOf(d.value)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
  const area = pts.length > 1 ? `${line} L${pts[pts.length - 1][0]},${yOf(0)} L${pts[0][0]},${yOf(0)} Z` : "";
  const last = data.length - 1;

  // The crosshair snaps to the nearest exam; the overlay starts half a step left of the first point.
  function nearest(e: React.PointerEvent<SVGRectElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    setHover(data.length > 1 ? Math.max(0, Math.min(last, Math.round((e.clientX - box.left - step / 2) / step))) : 0);
  }

  return (
    <div ref={ref} className="viz-plot">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Line chart">
          {[0, 25, 50, 75, 100].map((t) => (
            <g key={t}>
              <line x1={m.left} x2={width - m.right} y1={yOf(t)} y2={yOf(t)} className={t === 0 ? "viz-base" : "viz-grid"} />
              <text x={m.left - 8} y={yOf(t)} className="viz-tick" textAnchor="end" dominantBaseline="middle">{t}%</text>
            </g>
          ))}
          {area && <path d={area} fill={color} opacity={0.1} />}
          {pts.length > 1 && <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {hover !== null && <line x1={pts[hover][0]} x2={pts[hover][0]} y1={m.top} y2={m.top + ih} className="viz-cross" />}
          {pts.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={hover === i ? 5.5 : 4} fill={color} stroke="var(--surface)" strokeWidth={2} />
          ))}
          {data.map((d, i) => {
            const [a, b] = splitLabel(d.label);
            const anchor = data.length > 1 && i === 0 ? "start" : data.length > 1 && i === last ? "end" : "middle";
            return (
              <text key={i} x={xOf(i)} y={height - 22} className="viz-tick" textAnchor={anchor}>
                <tspan x={xOf(i)}>{a}</tspan>
                {b && <tspan x={xOf(i)} dy="1.2em">{b}</tspan>}
              </text>
            );
          })}
          {last >= 0 && (
            <text x={pts[last][0] + 8} y={pts[last][1]} className="viz-value" dominantBaseline="middle">{data[last].value}%</text>
          )}
          <rect
            x={m.left - step / 2}
            y={m.top}
            width={iw + step}
            height={ih}
            fill="transparent"
            onPointerMove={nearest}
            onPointerEnter={nearest}
            onPointerLeave={() => setHover(null)}
          />
          {pts.map(([x, y], i) => (
            <circle key={`hit${i}`} cx={x} cy={y} r={12} fill="transparent" tabIndex={0} aria-label={`${data[i].label}: ${data[i].value}%`} onFocus={() => setHover(i)} onBlur={() => setHover(null)} style={{ pointerEvents: "none" }} />
          ))}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <Tooltip x={pts[hover][0]} y={pts[hover][1] - 10} width={width}>
          <strong>{data[hover].value}%</strong>
          <span>{data[hover].label}{detail ? ` · ${detail(hover)}` : ""}</span>
        </Tooltip>
      )}
    </div>
  );
}

/** Horizontal stacked bars, one per row (e.g. class), as amounts or as shares of 100%. */
export function StackedBars({
  rows,
  series,
  format,
  percent = false,
  endLabel,
}: {
  rows: { label: string; values: number[] }[];
  series: LegendItem[];
  format: (v: number) => string;
  percent?: boolean;
  endLabel?: (row: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ r: number; s: number } | null>(null);
  const labelW = Math.min(120, Math.max(70, width * 0.24));
  const m = { top: 6, right: endLabel ? 56 : 12, bottom: 24, left: labelW };
  const barH = 20;
  const gapY = 16;
  const height = m.top + rows.length * (barH + gapY) - gapY + m.bottom + 8;
  const iw = Math.max(0, width - m.left - m.right);
  const totals = rows.map((r) => r.values.reduce((a, b) => a + b, 0));
  const ticks = percent ? [0, 25, 50, 75, 100] : niceTicks(Math.max(...totals, 0));
  const top = percent ? 100 : ticks[ticks.length - 1] || 1;
  const scale = (v: number, row: number) => (percent ? (totals[row] ? (v / totals[row]) * 100 : 0) : v) / top * iw;
  const SEG_GAP = 2;

  let tip: { x: number; y: number; r: number; s: number } | null = null;
  return (
    <div ref={ref} className="viz-plot">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Bar chart">
          {ticks.map((t) => {
            const x = m.left + (t / top) * iw;
            return (
              <g key={t}>
                <line x1={x} x2={x} y1={m.top - 2} y2={height - m.bottom} className={t === 0 ? "viz-base" : "viz-grid"} />
                <text x={x} y={height - 8} className="viz-tick" textAnchor="middle">{percent ? `${t}%` : compact(t)}</text>
              </g>
            );
          })}
          {rows.map((row, r) => {
            const y = m.top + r * (barH + gapY);
            let x = m.left;
            const nonZero = row.values.map((v, s) => (v > 0 ? s : -1)).filter((s) => s >= 0);
            const lastSeg = nonZero[nonZero.length - 1];
            return (
              <g key={row.label}>
                <text x={m.left - 10} y={y + barH / 2} className="viz-row" textAnchor="end" dominantBaseline="middle">{row.label}</text>
                {row.values.map((v, s) => {
                  const w = scale(v, r);
                  const x0 = x;
                  x += w;
                  if (w <= 0) return null;
                  const drawn = s === lastSeg ? w : Math.max(0, w - SEG_GAP);
                  const active = hover?.r === r && hover.s === s;
                  if (active) tip = { x: x0 + w / 2, y: y - 6, r, s };
                  return (
                    <g key={s}>
                      {s === lastSeg ? (
                        <path d={barPath(x0, y, drawn, barH, "right")} fill={series[s].color} opacity={hover === null || active ? 1 : 0.6} />
                      ) : (
                        <rect x={x0} y={y} width={drawn} height={barH} fill={series[s].color} opacity={hover === null || active ? 1 : 0.6} />
                      )}
                      <rect
                        x={x0}
                        y={y - gapY / 2}
                        width={w}
                        height={barH + gapY}
                        fill="transparent"
                        tabIndex={0}
                        aria-label={`${row.label}, ${series[s].label}: ${format(v)}`}
                        onPointerEnter={() => setHover({ r, s })}
                        onPointerLeave={() => setHover(null)}
                        onFocus={() => setHover({ r, s })}
                        onBlur={() => setHover(null)}
                      />
                    </g>
                  );
                })}
                {endLabel && (
                  <text x={width - m.right + 8} y={y + barH / 2} className="viz-value" dominantBaseline="middle">{endLabel(r)}</text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {(() => {
        const t = tip as { x: number; y: number; r: number; s: number } | null;
        if (!t) return null;
        const v = rows[t.r].values[t.s];
        const share = totals[t.r] ? Math.round((v / totals[t.r]) * 100) : 0;
        return (
          <Tooltip x={t.x} y={t.y} width={width}>
            <strong>{format(v)}</strong>
            <span>
              <i className="viz-tip-key" style={{ background: series[t.s].color }} />
              {series[t.s].label} · {rows[t.r].label} · {share}%
            </span>
          </Tooltip>
        );
      })()}
    </div>
  );
}
