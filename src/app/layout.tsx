import type { Metadata } from "next";
import "./globals.css";
import { currentTheme } from "@/lib/theme";

export const metadata: Metadata = {
  title: "SchoolSync AI",
  description: "AI-powered school communication: announcements, WhatsApp, posters and role-based dashboards.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme={await currentTheme()}>
      <body>{children}</body>
    </html>
  );
}
