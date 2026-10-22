/**
 * The sign-in page's picture: learners walking to school while the school
 * bus drives past. Plain SVG animated with CSS (see .scene-* in globals.css);
 * it stands still for people who prefer reduced motion.
 */

function Kid({ x, shirt, bag, delay, tall = 1 }: { x: number; shirt: string; bag: string; delay: string; tall?: number }) {
  return (
    <g className="scene-walker">
      <g transform={`translate(${x} 0) scale(${tall})`}>
        <g className="scene-bob" style={{ animationDelay: delay }}>
          {/* back leg and arm first so the front ones draw over them */}
          <line className="scene-leg scene-leg-b" x1="0" y1="-38" x2="0" y2="-12" />
          <line className="scene-arm scene-arm-b" x1="0" y1="-62" x2="0" y2="-42" />
          <rect x="-15" y="-64" width="11" height="20" rx="3" fill={bag} />
          <line x1="0" y1="-66" x2="0" y2="-38" stroke={shirt} strokeWidth="9" strokeLinecap="round" />
          <circle cx="0" cy="-77" r="9" fill="#6b4a32" />
          <path d="M-9 -80 a9 9 0 0 1 18 0 z" fill="#2b211b" />
          <line className="scene-leg scene-leg-f" x1="0" y1="-38" x2="0" y2="-12" />
          <line className="scene-arm scene-arm-f" x1="0" y1="-62" x2="0" y2="-42" />
        </g>
      </g>
    </g>
  );
}

export default function SchoolScene() {
  return (
    <svg className="scene" viewBox="0 0 800 600" preserveAspectRatio="xMaxYMax slice" role="img" aria-label="Learners walking to school as the school bus drives by">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bfe3ff" />
          <stop offset="1" stopColor="#fdf3dc" />
        </linearGradient>
      </defs>
      <rect width="800" height="600" fill="url(#sky)" />

      {/* sun and clouds */}
      <g className="scene-sun">
        <circle cx="640" cy="110" r="46" fill="#ffd166" />
        <circle cx="640" cy="110" r="64" fill="#ffd166" opacity="0.25" />
      </g>
      <g className="scene-cloud" style={{ animationDuration: "60s" }}>
        <g fill="#fff" opacity="0.95"><ellipse cx="160" cy="120" rx="58" ry="20" /><ellipse cx="195" cy="104" rx="36" ry="24" /><ellipse cx="135" cy="108" rx="28" ry="18" /></g>
      </g>
      <g className="scene-cloud" style={{ animationDuration: "85s", animationDelay: "-30s" }}>
        <g fill="#fff" opacity="0.85"><ellipse cx="430" cy="70" rx="46" ry="15" /><ellipse cx="455" cy="58" rx="28" ry="18" /></g>
      </g>

      {/* hills and trees */}
      <path d="M0 360 C140 300 260 330 380 350 S640 300 800 330 V600 H0 Z" fill="#9ed39a" />
      <path d="M0 400 C180 360 320 390 470 395 S700 370 800 385 V600 H0 Z" fill="#7cc276" />
      {[70, 250, 470].map((x) => (
        <g key={x}>
          <rect x={x - 4} y="350" width="8" height="40" fill="#7a5a3a" />
          <circle cx={x} cy="340" r="24" fill="#4f9d58" />
          <circle cx={x + 14} cy="350" r="16" fill="#5aad62" />
        </g>
      ))}

      {/* the school */}
      <g>
        <rect x="540" y="250" width="230" height="150" fill="#f4efe6" stroke="#d9cfbf" strokeWidth="2" />
        <polygon points="530,252 655,190 780,252" fill="#c0392b" />
        <rect x="625" y="320" width="40" height="80" rx="3" fill="#7a4b2a" />
        <circle cx="655" cy="225" r="13" fill="#fff" stroke="#7a4b2a" strokeWidth="2" />
        <line x1="655" y1="225" x2="655" y2="216" stroke="#333" strokeWidth="2" />
        <line x1="655" y1="225" x2="662" y2="225" stroke="#333" strokeWidth="2" />
        {[560, 690, 730].map((x) => <rect key={x} x={x} y="280" width="28" height="26" rx="2" fill="#9fd3f5" stroke="#d9cfbf" strokeWidth="2" />)}
        {[560, 690, 730].map((x) => <rect key={`l${x}`} x={x} y="335" width="28" height="26" rx="2" fill="#9fd3f5" stroke="#d9cfbf" strokeWidth="2" />)}
        <rect x="583" y="410" width="145" height="8" fill="#d9cfbf" opacity="0.8" />
        <line x1="530" y1="400" x2="530" y2="230" stroke="#8a8a8a" strokeWidth="4" />
        <g className="scene-flag">
          <rect x="532" y="232" width="38" height="8" fill="#000" />
          <rect x="532" y="240" width="38" height="3" fill="#fff" />
          <rect x="532" y="243" width="38" height="8" fill="#bb0000" />
          <rect x="532" y="251" width="38" height="3" fill="#fff" />
          <rect x="532" y="254" width="38" height="8" fill="#006600" />
        </g>
      </g>

      {/* path to school, then the road */}
      <rect x="0" y="430" width="800" height="26" fill="#e9dcc3" />
      <rect x="0" y="456" width="800" height="144" fill="#5b6270" />
      <g>
        {Array.from({ length: 12 }, (_, i) => <rect key={i} x={i * 80} y="524" width="44" height="6" rx="3" fill="#f5f5f5" opacity="0.85" />)}
      </g>

      {/* learners walking to school */}
      <g transform="translate(0 446)">
        <Kid x={0} shirt="#2952cc" bag="#f39c12" delay="0s" />
        <Kid x={-46} shirt="#c0392b" bag="#16a085" delay="-0.4s" tall={0.88} />
        <Kid x={-96} shirt="#0f9d76" bag="#8e44ad" delay="-0.8s" />
      </g>

      {/* the school bus */}
      <g className="scene-bus">
        <g transform="translate(0 470)">
          <rect x="0" y="0" width="190" height="72" rx="12" fill="#ffc21a" />
          <rect x="150" y="16" width="40" height="40" rx="6" fill="#ffc21a" />
          <rect x="0" y="42" width="190" height="6" fill="#222" opacity="0.8" />
          {[14, 50, 86, 122].map((x) => <rect key={x} x={x} y="10" width="28" height="24" rx="3" fill="#cfeaff" />)}
          <rect x="158" y="10" width="24" height="26" rx="3" fill="#cfeaff" />
          <text x="62" y="62" fontSize="11" fontWeight="700" fill="#222" fontFamily="system-ui, sans-serif">SCHOOL BUS</text>
          <circle cx="186" cy="58" r="4" fill="#fff6b0" />
          {[40, 150].map((x) => (
            <g key={x} className="scene-wheel">
              <circle cx={x} cy="74" r="15" fill="#222" />
              <circle cx={x} cy="74" r="6" fill="#bbb" />
              <rect x={x - 1.5} y="61" width="3" height="10" fill="#bbb" />
            </g>
          ))}
        </g>
      </g>
    </svg>
  );
}
