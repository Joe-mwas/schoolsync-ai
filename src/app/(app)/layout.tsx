import ChangePasswordForm from "@/components/ChangePasswordForm";
import Nav, { SignOutButton, type NavItem } from "@/components/Nav";
import { requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/permissions";
import { DUTY_MANAGERS, FEE_VIEWERS, LEADERS, OFFICE, PEOPLE_MANAGERS, SCHOOL_WIDE, STAFF, type Role } from "@/lib/types";

const NAV: (NavItem & { roles?: Role[] })[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/announcements", label: "Announcements" },
  { href: "/assistant", label: "AI Assistant" },
  { href: "/results", label: "Results", roles: STAFF },
  { href: "/fees", label: "Fees", roles: FEE_VIEWERS },
  { href: "/facts", label: "School facts", roles: OFFICE },
  { href: "/events", label: "Events", roles: SCHOOL_WIDE },
  { href: "/duties", label: "Duties", roles: [...DUTY_MANAGERS, "teacher"] },
  { href: "/posters", label: "Poster Designer", roles: STAFF },
  { href: "/whatsapp", label: "WhatsApp", roles: SCHOOL_WIDE },
  { href: "/school", label: "School Admin", roles: PEOPLE_MANAGERS },
  { href: "/admin-ai", label: "Admin AI", roles: ["admin"] },
  { href: "/school-ai", label: "School AI", roles: ["director", "headteacher"] },
  { href: "/ai-review", label: "AI Review", roles: ["admin"] },
  { href: "/setup", label: "Setup", roles: ["admin"] },
  { href: "/account", label: "My account" },
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
      <main className="main">
        {user.mustChangePassword ? (
          <div style={{ maxWidth: 560 }}>
            <ChangePasswordForm required />
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
