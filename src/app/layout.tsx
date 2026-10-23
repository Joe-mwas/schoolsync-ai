import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { currentTheme } from "@/lib/theme";

export const metadata: Metadata = {
  title: "SchoolSync",
  description: "AI-powered school communication: announcements, WhatsApp, posters and role-based dashboards.",
};

// Headings, figures and the brand use a refined display face; body text stays the device's own font (fast, familiar).
const display = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display", display: "swap" });

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme={await currentTheme()} className={display.variable}>
      <body>{children}</body>
    </html>
  );
}
