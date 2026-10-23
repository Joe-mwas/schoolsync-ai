import BrandMark, { Wordmark } from "@/components/BrandMark";
import ChangePasswordForm from "@/components/ChangePasswordForm";
import ChatBuddy from "@/components/ChatBuddy";
import IdleGuard from "@/components/IdleGuard";
import NotificationBell from "@/components/NotificationBell";
import Nav, { MenuToggle, MobileBar, SignOutButton, type NavItem } from "@/components/Nav";
import { cookies } from "next/headers";
import ThemeToggle from "@/components/ThemeToggle";
import TwoStepCard from "@/components/TwoStepCard";
import { currentTheme } from "@/lib/theme";
import { schoolName } from "@/lib/ai";
import { isStaff, needsTwoStepSetup, requireUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/permissions";
import { ASSIGNMENT_SETTERS, DUTY_VIEWERS, FEE_VIEWERS, OFFICE, PEOPLE_MANAGERS, POSTER_MAKERS, SCHOOL_WIDE, STAFF, WHATSAPP_INBOX, type Role } from "@/lib/types";

const NAV: (NavItem & { roles?: Role[] })[] = [
  { href: "/dashboard", label: "Dashboard", icon: "home", group: "everyday" },
  { href: "/noticeboard", label: "Noticeboard", icon: "pin", group: "everyday" },
  { href: "/announcements", label: "Announcements", icon: "megaphone", group: "everyday" },
  // The director's AI Assistant is the School AI (school and families only; system questions go to the administrator).
  { href: "/assistant", label: "AI Assistant", icon: "sparkles", group: "everyday", roles: ["admin", "headteacher", "secretary", "teacher", "parent", "student"] },
  { href: "/school-ai", label: "AI Assistant", icon: "sparkles", group: "everyday", roles: ["director"] },
  { href: "/assignments", label: "Assignments & revision", icon: "book", group: "school", roles: ["student"] },
  { href: "/results", label: "Results", icon: "chart", group: "school", roles: [...STAFF, "parent"] },
  { href: "/assignments", label: "Assignments", icon: "book", group: "school", roles: ASSIGNMENT_SETTERS },
  { href: "/fees", label: "Fees", icon: "wallet", group: "school", roles: FEE_VIEWERS },
  { href: "/facts", label: "School facts", icon: "info", group: "school", roles: OFFICE },
  { href: "/events", label: "Events", icon: "calendar", group: "school", roles: SCHOOL_WIDE },
  { href: "/duties", label: "Duties", icon: "clipboard", group: "school", roles: [...DUTY_VIEWERS, "teacher"] },
  { href: "/posters", label: "Poster Designer", icon: "image", group: "school", roles: POSTER_MAKERS },
  { href: "/whatsapp", label: "WhatsApp", icon: "chat", group: "school", roles: WHATSAPP_INBOX },
  { href: "/school", label: "School Admin", icon: "users", group: "admin", roles: PEOPLE_MANAGERS },
  { href: "/admin-ai", label: "Admin AI", icon: "bot", group: "admin", roles: ["admin"] },
  { href: "/school-ai", label: "School AI", icon: "bot", group: "admin", roles: ["headteacher"] },
  { href: "/ai-review", label: "AI Review", icon: "check", group: "admin", roles: ["admin"] },
  { href: "/activity", label: "Activity log", icon: "activity", group: "admin", roles: ["admin"] },
  { href: "/setup", label: "Setup", icon: "settings", group: "admin", roles: ["admin"] },
  { href: "/account", label: "My account", icon: "user", group: "you" },
];

/** The phone bar's four main places, in order of preference for each person. */
const QUICK = ["/dashboard", "/noticeboard", "/results", "/assignments", "/assistant", "/school-ai", "/announcements"];

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const db = await readDb();
  const { profile } = db;
  const setupTwoStep = !user.mustChangePassword && needsTwoStepSetup(user, db);
  const items = NAV.filter((n) => !n.roles || n.roles.includes(user.role)).map(({ roles: _roles, ...item }) => item);
  const compact = (await cookies()).get("menu")?.value === "compact";
  const theme = await currentTheme();
  return (
    <div className={`shell${compact ? " is-compact" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-inner">
          <div className="brand">
            <BrandMark /> <Wordmark />
            <NotificationBell />
          </div>
          {(profile.logo || profile.name) && (
            <div className="school-badge">
              {profile.logo && <img src={`/api/school/logo?v=${encodeURIComponent(profile.logo.file)}`} alt="" width={28} height={28} />}
              <span>{profile.name || schoolName()}</span>
            </div>
          )}
          <Nav items={items} />
          <div className="menu-tools">
            <ThemeToggle initial={theme} inMenu />
            <MenuToggle initial={compact} />
          </div>
          <div className="user-card">
            <span className="avatar" aria-hidden="true">{user.name.trim().charAt(0).toUpperCase()}</span>
            <div className="user-text">
              <strong>{user.name}</strong>
              {ROLE_LABELS[user.role]} · <SignOutButton />
            </div>
          </div>
        </div>
      </aside>
      <main className="main">
        {user.mustChangePassword ? (
          <div style={{ maxWidth: 560 }}>
            <ChangePasswordForm required />
          </div>
        ) : setupTwoStep ? (
          <div style={{ maxWidth: 620 }}>
            <TwoStepCard enabled={false} required forced />
          </div>
        ) : (
          children
        )}
      </main>
      <MobileBar
        items={items}
        main={QUICK}
        footer={
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="small"><strong>{user.name}</strong> · {ROLE_LABELS[user.role]} · <SignOutButton /></span>
            <ThemeToggle initial={theme} />
          </div>
        }
      />
      {user.role === "admin" && !user.mustChangePassword && !setupTwoStep && <ChatBuddy name={user.name} />}
      {isStaff(user) && <IdleGuard minutes={db.security.idleMinutes} />}
    </div>
  );
}
