"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Auto sign-out for staff. Activity (typing, clicking, scrolling, touching)
 * in any open tab keeps the session going: a heartbeat extends it on the
 * server. After `minutes` with no activity a one-minute warning appears,
 * then the person is signed out. The server ends the session too, so
 * closing the laptop lid doesn't keep it open.
 */

const STORE = "schoolsync.lastActive";
const HEARTBEAT_MS = 60_000;
const WARN_MS = 60_000;

function readShared(): number {
  try {
    return Number(localStorage.getItem(STORE)) || 0;
  } catch {
    return 0;
  }
}

export default function IdleGuard({ minutes }: { minutes: number }) {
  const limit = minutes * 60_000;
  const last = useRef(Date.now());
  const lastBeat = useRef(Date.now());
  const done = useRef(false);
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const mark = () => {
      const now = Date.now();
      if (now - last.current < 2000) return;
      last.current = now;
      try {
        localStorage.setItem(STORE, String(now));
      } catch {
        /* this tab only */
      }
    };
    mark();

    const signOut = async () => {
      if (done.current) return;
      done.current = true;
      await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "idle" }) }).catch(() => {});
      window.location.href = "/login?signedOut=idle";
    };

    const tick = async () => {
      const now = Date.now();
      const active = Math.max(last.current, readShared());
      const idle = now - active;
      if (idle >= limit) return signOut();
      setLeft(idle >= limit - WARN_MS ? Math.ceil((limit - idle) / 1000) : null);
      // Activity since the last heartbeat: tell the server we're still here.
      if (active > lastBeat.current && now - lastBeat.current >= HEARTBEAT_MS) {
        lastBeat.current = now;
        const res = await fetch("/api/auth/heartbeat", { method: "POST" }).catch(() => null);
        if (res && res.status === 401) {
          done.current = true;
          window.location.href = "/login?signedOut=expired";
        }
      }
    };

    const events = ["pointerdown", "keydown", "scroll", "touchstart", "wheel"] as const;
    for (const e of events) window.addEventListener(e, mark, { passive: true, capture: true });
    const timer = window.setInterval(tick, 1000);
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      for (const e of events) window.removeEventListener(e, mark, { capture: true });
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [limit]);

  if (left === null) return null;
  return (
    <div className="idle-warning" role="alertdialog" aria-live="assertive" aria-labelledby="idle-title">
      <div className="idle-card">
        <strong id="idle-title">Still there?</strong>
        <p>For safety you&apos;ll be signed out in <strong>{left}</strong> second{left === 1 ? "" : "s"}.</p>
        <button
          type="button"
          onClick={() => {
            last.current = Date.now();
            lastBeat.current = 0;
            try {
              localStorage.setItem(STORE, String(last.current));
            } catch {
              /* this tab only */
            }
            setLeft(null);
          }}
        >
          Stay signed in
        </button>
      </div>
    </div>
  );
}
