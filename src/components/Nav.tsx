"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
}

export default function Nav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="nav">
      {items.map((item) => (
        <Link key={item.href} href={item.href} className={pathname.startsWith(item.href) ? "active" : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
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
