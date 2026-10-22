import BrandMark from "@/components/BrandMark";
import { redirect } from "next/navigation";
import { schoolName } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { DEMO_PASSWORD } from "@/lib/seed";
import LoginForm from "./LoginForm";
import SchoolScene from "./SchoolScene";
import ThemeToggle from "@/components/ThemeToggle";
import { currentTheme } from "@/lib/theme";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  const showDemo = process.env.NODE_ENV !== "production" || process.env.SHOW_DEMO_ACCOUNTS === "1";
  const school = process.env.SCHOOL_NAME?.trim() ? schoolName() : null;
  return (
    <div className="auth">
      <section className="auth-panel">
        <div className="auth-inner">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div className="brand">
              <BrandMark /> SchoolSync AI
            </div>
            <ThemeToggle initial={await currentTheme()} />
          </div>
          <div>
            {school && <div className="auth-school">{school}</div>}
            <h1 className="auth-title">Welcome back</h1>
            <p className="muted" style={{ margin: 0 }}>Sign in to your school&apos;s communication hub.</p>
          </div>
          <LoginForm demoPassword={showDemo ? DEMO_PASSWORD : null} />
          <div className="credit">Prepared by <strong>Joe the Techie</strong></div>
        </div>
      </section>
      <section className="auth-art">
        <div className="auth-tagline">
          <strong>Every parent, teacher and learner, in sync.</strong>
          <span>Announcements, results, fees and WhatsApp in one place.</span>
        </div>
        <SchoolScene />
      </section>
    </div>
  );
}
