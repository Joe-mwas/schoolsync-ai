"use client";

import { useState } from "react";
import { IconTile } from "./Icon";

export type Theme = "light" | "dark";

/**
 * Switch between the soft-white and dark look. Remembered on this device (a cookie, so pages load in the right theme).
 * `inMenu`: drawn like the menu's other buttons (icon and label, the label hidden when the menu is shrunk).
 */
export default function ThemeToggle({ initial, inMenu = false }: { initial: Theme; inMenu?: boolean }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const next: Theme = theme === "dark" ? "light" : "dark";

  function toggle() {
    document.documentElement.dataset.theme = next;
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
    setTheme(next);
  }

  if (inMenu)
    return (
      <button type="button" className="menu-toggle" onClick={toggle} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}>
        <IconTile name={theme === "dark" ? "sun" : "moon"} />
        <span className="nav-label">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
      </button>
    );
  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}>
      {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
    </button>
  );
}
