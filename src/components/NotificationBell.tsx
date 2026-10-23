"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { NotificationItem } from "@/lib/notifications";

/**
 * The bell in the menu: what's new for this person (announcements, posters,
 * results, WhatsApp messages…), checked every minute, and the switch for
 * notifications on this phone or computer.
 */

const ICONS: Record<NotificationItem["kind"], string> = {
  announcement: "📢",
  poster: "🖼️",
  results: "📘",
  payment: "💳",
  assignment: "📚",
  whatsapp: "💬",
  "password-help": "🔑",
};

function ago(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export default function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/notifications", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const data = await res.json();
    setItems(data.items);
    setUnread(data.unread);
    setSeenAt(data.seenAt);
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  // The tab title shows the count, like a chat app.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = unread > 0 ? `(${unread}) ${base}` : base;
  }, [unread]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      await fetch("/api/notifications", { method: "POST" }).catch(() => {});
    }
  }

  return (
    <div className="bell" ref={panel}>
      <button type="button" className="bell-button" onClick={toggle} aria-expanded={open} aria-label={unread ? `Notifications, ${unread} new` : "Notifications"}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && <span className="bell-count">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <strong>Notifications</strong>
          </div>
          <ul className="bell-list">
            {items.length === 0 && <li className="muted small" style={{ padding: 14 }}>Nothing new in the last 30 days.</li>}
            {items.map((n) => (
              <li key={n.id}>
                <Link href={n.href} className={`bell-item${seenAt && n.at <= seenAt ? "" : " is-new"}`} onClick={() => setOpen(false)}>
                  <span className="bell-icon" aria-hidden="true">{ICONS[n.kind]}</span>
                  <span className="bell-text">
                    <strong>{n.title}</strong>
                    {n.body && <span className="small muted">{n.body}</span>}
                    <span className="small muted">{ago(n.at)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="bell-foot">
            <PushToggle compact />
          </div>
        </div>
      )}
    </div>
  );
}

function urlKey(base64: string): Uint8Array {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type PushStatus = "checking" | "unsupported" | "ios-install" | "blocked" | "off" | "on";

/** Turn notifications on this phone or computer on or off. */
export function PushToggle({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<PushStatus>("checking");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return setStatus(ios && !standalone ? "ios-install" : "unsupported");
      }
      if (Notification.permission === "denied") return setStatus("blocked");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? "on" : "off");
    })().catch(() => setStatus("unsupported"));
  }, []);

  async function turnOn() {
    setBusy(true);
    setMsg(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const { publicKey } = await (await fetch("/api/push")).json();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlKey(publicKey) as BufferSource });
      const res = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), test: true }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't turn them on");
      setStatus("on");
      setMsg("On. A test notification is on its way.");
    } catch (e) {
      setMsg((e as Error).message || "Couldn't turn them on");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setStatus("off");
    } finally {
      setBusy(false);
    }
  }

  const text: Record<PushStatus, string> = {
    checking: "",
    unsupported: "This browser can't show notifications. Try Chrome on Android, or a computer.",
    "ios-install": "On iPhone: tap Share → Add to Home Screen, open SchoolSync from the Home Screen, then turn notifications on here.",
    blocked: "Notifications are blocked for this site. Allow them in the browser's site settings (the padlock by the address), then come back.",
    off: compact ? "Get these on your phone, even when SchoolSync is closed." : "Get a notification on this phone or computer for announcements, posters, results and messages, even when SchoolSync is closed.",
    on: "Notifications are on for this device.",
  };
  if (status === "checking") return null;
  return (
    <div className={`push-toggle${compact ? " compact" : ""}`}>
      <span className="small muted">{text[status]}</span>
      {status === "off" && <button type="button" className="small" disabled={busy} onClick={turnOn} id="push-on">{busy ? "Turning on…" : "Turn on phone notifications"}</button>}
      {status === "on" && <button type="button" className="secondary small" disabled={busy} onClick={turnOff}>Turn off</button>}
      {msg && <span className="small" role="status">{msg}</span>}
    </div>
  );
}
