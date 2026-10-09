import Nav, { SignOutButton, type NavItem } from "@/components/Nav";
import { requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/permissions";
import type { Role } from "@/lib/types";

const NAV: (NavItem & { roles?: Role[] })[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/announcements", label: "Announcements" },
  { href: "/assistant", label: "AI Assistant" },
  { href: "/posters", label: "Poster Designer", roles: ["director", "teacher"] },
  { href: "/whatsapp", label: "WhatsApp", roles: ["director"] },
  { href: "/school", label: "School Admin", roles: ["director"] },
];

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const items = NAV.filter((n) => !n.roles || n.roles.includes(user.role)).map(({ href, label }) => ({ href, label }));
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-inner">
          <div className="brand">
            <span className="brand-mark">S</span> SchoolSync
          </div>
          <Nav items={items} />
          <div className="user-card">
            <strong>{user.name}</strong>
            {ROLE_LABELS[user.role]} · <SignOutButton />
          </div>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
