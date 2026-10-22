/** The SchoolSync mark (the same graduation cap as the browser-tab icon, src/app/icon.svg). */
export default function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="brand-mark-svg" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#2952cc" />
      <polygon points="32,14 58,26 32,38 6,26" fill="#ffffff" />
      <path d="M17 31.5 V41 C17 46 24.5 50 32 50 C39.5 50 47 46 47 41 V31.5 L32 38.5 Z" fill="#ffffff" opacity="0.92" />
      <path d="M52 28.5 V41" stroke="#ffd166" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="52" cy="43" r="3" fill="#ffd166" />
    </svg>
  );
}
