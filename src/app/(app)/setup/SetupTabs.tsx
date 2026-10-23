import Link from "next/link";

/** The two halves of Setup: onboarding a school, and the system's connections. */
export default function SetupTabs({ active }: { active: "onboarding" | "connections" }) {
  return (
    <nav className="tabs" aria-label="Setup">
      <Link href="/setup" className={active === "onboarding" ? "tab active" : "tab"} aria-current={active === "onboarding" ? "page" : undefined}>Onboarding</Link>
      <Link href="/setup/connections" className={active === "connections" ? "tab active" : "tab"} aria-current={active === "connections" ? "page" : undefined}>Connections &amp; security</Link>
    </nav>
  );
}
