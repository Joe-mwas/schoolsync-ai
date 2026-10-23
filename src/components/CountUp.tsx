"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A figure that counts up when the page opens ("Ksh 730,000", "50", "67%").
 * The real value is in the page from the start; the count-up is a quick
 * flourish after load, skipped for people who prefer reduced motion.
 */
export default function CountUp({ value, duration = 700 }: { value: string | number; duration?: number }) {
  const text = String(value);
  const m = /^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/.exec(text);
  const [shown, setShown] = useState(text);
  const started = useRef(false);

  useEffect(() => {
    if (!m || started.current) return;
    started.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const [, prefix, num, suffix] = m;
    const target = Number(num.replace(/,/g, ""));
    if (!Number.isFinite(target) || target === 0) return;
    const decimals = num.includes(".") ? num.split(".")[1].length : 0;
    const grouped = num.includes(",");
    const fmt = (n: number) => (grouped ? n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : n.toFixed(decimals));
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - (1 - p) ** 3;
      setShown(`${prefix}${fmt(target * eased)}${suffix}`);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Runs once per mount; the value is fixed for the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <span aria-label={text}>{shown}</span>;
}
