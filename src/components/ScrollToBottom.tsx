"use client";

import { useEffect, useRef } from "react";

/** Keeps a chat scrolled to the newest message, also after the page refreshes. */
export default function ScrollToBottom({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  });
  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}
