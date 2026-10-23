/**
 * The SchoolSync mark: the graduation cap inside two sync arrows (the same
 * picture as the browser-tab icon, src/app/icon.svg). `animated` plays the
 * sign-in intro: the cap pops in, the arrows draw round it, then turn every
 * few seconds (see .sync-* in globals.css).
 */
export default function BrandMark({ size = 28, animated = false }: { size?: number; animated?: boolean }) {
  return (
    <svg className={`brand-mark-svg${animated ? " is-animated" : ""}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#2952cc" />
      <g className="sync-arrows" fill="#ffd166" stroke="#ffd166">
        <path className="sync-arc" pathLength={1} d="M10.4 24.1 A23 23 0 0 1 51.9 20.5" fill="none" strokeWidth="3.4" strokeLinecap="round" />
        <path className="sync-arc" pathLength={1} d="M53.6 39.9 A23 23 0 0 1 12.1 43.5" fill="none" strokeWidth="3.4" strokeLinecap="round" />
        <polygon className="sync-head" points="53.7,23.5 54.6,17.2 47.7,21.2" strokeWidth="1.2" strokeLinejoin="round" />
        <polygon className="sync-head" points="10.3,40.5 9.4,46.8 16.3,42.8" strokeWidth="1.2" strokeLinejoin="round" />
      </g>
      <g className="sync-cap">
        <g transform="translate(32 33) scale(0.6) translate(-32 -32)">
          <polygon points="32,14 58,26 32,38 6,26" fill="#ffffff" />
          <path d="M17 31.5 V41 C17 46 24.5 50 32 50 C39.5 50 47 46 47 41 V31.5 L32 38.5 Z" fill="#ffffff" opacity="0.92" />
          <path d="M52 28.5 V41" stroke="#ffd166" strokeWidth="3" strokeLinecap="round" />
          <circle cx="52" cy="43" r="3.4" fill="#ffd166" />
        </g>
      </g>
    </svg>
  );
}

/** "SchoolSync" with "Sync" in the accent colour. `animated`: the two halves glide in and meet, then "Sync" shines now and then. */
export function Wordmark({ animated = false }: { animated?: boolean }) {
  return (
    <span className={`wordmark brand-name${animated ? " is-animated" : ""}`} aria-label="SchoolSync">
      <span className="wm-school" aria-hidden="true">School</span>
      <span className="wm-sync" aria-hidden="true">Sync</span>
    </span>
  );
}
