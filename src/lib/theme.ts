import { cookies } from "next/headers";
import type { Theme } from "@/components/ThemeToggle";

/** The theme this person picked (light unless they chose dark). */
export async function currentTheme(): Promise<Theme> {
  return (await cookies()).get("theme")?.value === "dark" ? "dark" : "light";
}
