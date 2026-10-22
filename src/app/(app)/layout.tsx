import BrandMark from "@/components/BrandMark";
import ChangePasswordForm from "@/components/ChangePasswordForm";
import Nav, { SignOutButton, type NavItem } from "@/components/Nav";
import ThemeToggle from "@/components/ThemeToggle";
import { currentTheme } from "@/lib/theme";
import { requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/permissions";
import { ASSIGNMENT_SETTERS, DUTY_VIEWERS, FEE_VIEWERS, OFFICE, PEOPLE_MANAGERS, POSTER_MAKERS, SCHOOL_WIDE, STAFF, WHATSAPP_INBOX, type Role } from "@/lib/types";

const NAV: (NavItem & { roles?: Role[] })[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/announcements", label: "Announcements" },
  // The director's AI Assistant is the School AI (school and families only; system questions go to the administrator).
  { href: "/assistant", label: "AI Assistant", roles: ["admin", "headteacher", "secretary", "teacher", "parent", "student"] },
  { href: "/school-ai", label: "AI Assistant", roles: ["director"] },
  { href: "/assignments", label: "Assignments & revision", roles: ["student"] },
  { href: "/results", label: "Results", roles: STAFF },
  { href: "/assignments", label: "Assignments", roles: ASSIGNMENT_SETTERS },
  { href: "/fees", label: "Fees", roles: FEE_VIEWERS },
  { href: "/facts", label: "School facts", roles: OFFICE },
  { href: "/events", label: "Events", roles: SCHOOL_WIDE },
  { href: "/duties", label: "Duties", roles: [...DUTY_VIEWERS, "teacher"] },
  { href: "/posters", label: "Poster Designer", roles: POSTER_MAKERS },
  { href: "/whatsapp", label: "WhatsApp", roles: WHATSAPP_INBOX },
  { href: "/school", label: "School Admin", roles: PEOPLE_MANAGERS },
  { href: "/admin-ai", label: "Admin AI", roles: ["admin"] },
  { href: "/school-ai", label: "School AI", roles: ["headteacher"] },
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
            <BrandMark /> SchoolSync
          </div>
          <Nav items={items} />
          <div className="user-card">
            <strong>{user.name}</strong>
            {ROLE_LABELS[user.role]} · <SignOutButton />
            <div style={{ marginTop: 8 }}><ThemeToggle initial={await currentTheme()} /></div>
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
