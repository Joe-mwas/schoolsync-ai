"use client";

import { useState } from "react";

export type Theme = "light" | "dark";

/** Switch between the soft-white and dark look. Remembered on this device (a cookie, so pages load in the right theme). */
export default function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const next: Theme = theme === "dark" ? "light" : "dark";

  function toggle() {
    document.documentElement.dataset.theme = next;
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
    setTheme(next);
  }

  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}>
      {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
    </button>
  );
}
