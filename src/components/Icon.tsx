/** Simple line icons for the menu (24×24, drawn with the text colour). */

const PATHS = {
  home: "M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5",
  pin: "M9 3h6l-1 6 4 3v2H6v-2l4-3-1-6zM12 14v7",
  megaphone: "M3 10v4h3l7 4V6L6 10H3zM16 9a3 3 0 0 1 0 6M18.5 6.5a7 7 0 0 1 0 11",
  sparkles: "M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z",
  book: "M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5v-17zM4 19.5A2.5 2.5 0 0 1 6.5 17H20",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  wallet: "M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zM16 14.5h.01",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-5M12 8h.01",
  calendar: "M4 6h16v15H4zM4 10h16M9 3v4M15 3v4",
  clipboard: "M9 4h6v3H9zM7 5.5H5V21h14V5.5h-2M9 13l2 2 4-4",
  image: "M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15.5 9h.01",
  chat: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.1a4 4 0 0 1 0 7.8M22 21v-1a6 6 0 0 0-4-5.7",
  bot: "M12 3v3M5 8h14v11H5zM9 13h.01M15 13h.01M9.5 16.5h5M2 13h3M19 13h3",
  check: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM8 12l3 3 5-6",
  activity: "M22 12h-4l-3 8L9 4l-3 8H2",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15.1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V5a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 20.9 11H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  user: "M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM4 21v-1a7 7 0 0 1 14 0v1",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1.5v2M12 20.5v2M4.6 4.6 6 6M18 18l1.4 1.4M1.5 12h2M20.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4",
  moon: "M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z",
  chevronLeft: "M15 18l-6-6 6-6",
  chevronRight: "M9 18l6-6-6-6",
} as const;

export type IconName = keyof typeof PATHS;

/** Each icon's own colour, for the coloured tiles in the menu. Bright enough to read on the navy or dark menu. */
const COLOURS: Record<IconName, string> = {
  home: "#5b8cff", pin: "#ff7a59", megaphone: "#f5a524", sparkles: "#b57bff", book: "#38bdf8", chart: "#22c55e",
  wallet: "#10b981", info: "#60a5fa", calendar: "#f43f5e", clipboard: "#f59e0b", image: "#ec4899", chat: "#25d366",
  users: "#818cf8", bot: "#a78bfa", check: "#34d399", activity: "#fb7185", settings: "#94a3b8", user: "#2dd4bf",
  more: "#94a3b8", sun: "#fbbf24", moon: "#a5b4fc", chevronLeft: "#94a3b8", chevronRight: "#94a3b8",
};

export default function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === "more" ? 3 : 1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

/** The icon on a softly tinted rounded tile in its own colour (solid when the item is the current page; see .ic-tile). */
export function IconTile({ name, size = 17 }: { name: IconName; size?: number }) {
  return (
    <span className="ic-tile" style={{ "--ic": COLOURS[name] } as React.CSSProperties}>
      <Icon name={name} size={size} />
    </span>
  );
}
