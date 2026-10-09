"use client";

import { useEffect, useRef } from "react";
import { POSTER_HEIGHT, POSTER_WIDTH, renderPoster } from "@/lib/poster";
import type { PosterDesign } from "@/lib/types";

export default function PosterPreview({ design, maxWidth = 320 }: { design: PosterDesign; maxWidth?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (ctx) renderPoster(ctx, design);
  }, [design]);
  return (
    <canvas
      ref={ref}
      width={POSTER_WIDTH}
      height={POSTER_HEIGHT}
      className="poster-canvas"
      style={{ maxWidth, marginBottom: "0.75rem" }}
      aria-label={design.title}
    />
  );
}
