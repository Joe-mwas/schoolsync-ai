"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Icon, { type IconName } from "./Icon";

export type NavGroup = "everyday" | "school" | "admin" | "you";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  group: NavGroup;
}

const GROUP_TITLES: Record<NavGroup, string | null> = { everyday: "Everyday", school: "School", admin: "Admin", you: null };

/** Shorter names for the phone bar, where space is tight. */
const SHORT: Record<string, string> = { Noticeboard: "Notices", "AI Assistant": "Ask AI", "Assignments & revision": "Assignments", Announcements: "News" };

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** The menu, in groups with a heading each; icons only when the menu is shrunk. */
export default function Nav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const groups = (Object.keys(GROUP_TITLES) as NavGroup[]).map((g) => ({ g, list: items.filter((i) => i.group === g) })).filter((x) => x.list.length);
  return (
    <nav className="nav" aria-label="Menu">
      {groups.map(({ g, list }) => (
        <div key={g} className="nav-group">
          {GROUP_TITLES[g] && <div className="nav-heading">{GROUP_TITLES[g]}</div>}
          {list.map((item) => (
            <Link key={item.href + item.label} href={item.href} className={isActive(pathname, item.href) ? "active" : undefined} title={item.label}>
              <Icon name={item.icon} />
              <span className="nav-label">{item.label}</span>
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

/** Shrink the menu to icons (or widen it again); remembered on this device. */
export function MenuToggle({ initial }: { initial: boolean }) {
  const [compact, setCompact] = useState(initial);
  function toggle() {
    const next = !compact;
    document.querySelector(".shell")?.classList.toggle("is-compact", next);
    document.cookie = `menu=${next ? "compact" : "full"}; path=/; max-age=31536000; samesite=lax`;
    setCompact(next);
  }
  return (
    <button type="button" className="menu-toggle" onClick={toggle} aria-label={compact ? "Widen the menu" : "Shrink the menu to icons"} title={compact ? "Widen the menu" : "Shrink the menu"}>
      <Icon name={compact ? "chevronRight" : "chevronLeft"} size={18} />
      <span className="nav-label">Shrink menu</span>
    </button>
  );
}

/**
 * Phones: a floating bar at the bottom with the four main places and
 * "More", which slides up the whole menu, the account and sign out.
 */
export function MobileBar({ items, main, footer }: { items: NavItem[]; main: string[]; footer: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const quick = main.map((href) => items.find((i) => i.href === href)).filter((i): i is NavItem => Boolean(i)).slice(0, 4);
  const moreActive = !quick.some((i) => isActive(pathname, i.href));

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="sheet" role="dialog" aria-label="Menu" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" aria-hidden="true" />
            <Nav items={items} />
            <div className="sheet-footer">{footer}</div>
          </div>
        </div>
      )}
      <nav className="tabbar" aria-label="Main">
        {quick.map((i) => (
          <Link key={i.href} href={i.href} className={isActive(pathname, i.href) ? "active" : undefined}>
            <Icon name={i.icon} size={22} />
            <span>{SHORT[i.label] ?? i.label}</span>
          </Link>
        ))}
        <button type="button" className={`tab-more${open || moreActive ? " active" : ""}`} onClick={() => setOpen(!open)} aria-expanded={open}>
          <Icon name="more" size={22} />
          <span>More</span>
        </button>
      </nav>
    </>
  );
}

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className="link small"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.replace("/login");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
