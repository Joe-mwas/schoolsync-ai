import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { DEMO_PASSWORD } from "@/lib/seed";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  const showDemo = process.env.NODE_ENV !== "production" || process.env.SHOW_DEMO_ACCOUNTS === "1";
  return (
    <div className="login-wrap">
      <div className="card login-card stack">
        <div className="brand">
          <span className="brand-mark">S</span> SchoolSync AI
        </div>
        <p className="muted">Sign in to your school communication hub.</p>
        <LoginForm demoPassword={showDemo ? DEMO_PASSWORD : null} />
      </div>
    </div>
  );
}
