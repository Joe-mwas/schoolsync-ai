"use client";

import { useEffect, useRef } from "react";

/**
 * The sign-in page's picture: learners walking up to school while the
 * school bus pulls in, stops and drives off. Plain SVG animated with CSS
 * (see .scene-* in globals.css): only transforms and opacity move, so it
 * stays smooth on cheap phones. Layers shift a little with the pointer for
 * depth; Dark mode turns it into a night scene; it stands still for people
 * who prefer reduced motion.
 */

const v = (name: string) => ({ fill: `var(${name})` });
const stop = (name: string) => ({ stopColor: `var(${name})` });

function Kid({ shirt, bag, skin, hair, delay, scale = 1 }: { shirt: string; bag: string; skin: string; hair: string; delay: string; scale?: number }) {
  return (
    <g className="scene-walker" style={{ animationDelay: delay }}>
      <g transform={`scale(${scale})`}>
        <ellipse className="scene-shadow" cx="0" cy="0" rx="13" ry="3.2" />
        <g className="scene-bob">
          {/* back limbs first so the front ones draw over them */}
          <g className="scene-leg scene-leg-b"><line x1="0" y1="-34" x2="0" y2="-9" /><ellipse cx="2.5" cy="-6" rx="5" ry="3" className="scene-shoe" /></g>
          <g className="scene-arm scene-arm-b"><line x1="0" y1="-58" x2="0" y2="-40" style={{ stroke: skin }} /></g>
          <rect x="-16" y="-60" width="12" height="21" rx="4" fill={bag} />
          <rect x="-8" y="-63" width="16" height="31" rx="7" fill={shirt} />
          <circle cx="0" cy="-73" r="9.5" fill={skin} />
          <path d="M-9.5 -75 a9.5 9.5 0 0 1 19 0 q-4 -3 -9.5 -3 t-9.5 3z" fill={hair} />
          <circle cx="4" cy="-73" r="1.1" fill="#1b1410" />
          <g className="scene-leg scene-leg-f"><line x1="0" y1="-34" x2="0" y2="-9" /><ellipse cx="2.5" cy="-6" rx="5" ry="3" className="scene-shoe" /></g>
          <g className="scene-arm scene-arm-f"><line x1="0" y1="-58" x2="0" y2="-40" style={{ stroke: skin }} /></g>
        </g>
      </g>
    </g>
  );
}

function Bird({ x, y, s = 1, delay }: { x: number; y: number; s?: number; delay: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path className="scene-wing" style={{ animationDelay: delay }} d="M-9 0 Q-4.5 -5 0 0 Q4.5 -5 9 0" />
    </g>
  );
}

export default function SchoolScene() {
  const ref = useRef<SVGSVGElement>(null);

  // Depth: layers drift a few pixels against the pointer (fine pointers only, and not when motion is reduced).
  useEffect(() => {
    const svg = ref.current;
    if (!svg || !window.matchMedia("(pointer: fine)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        svg.style.setProperty("--px", ((e.clientX / window.innerWidth) * 2 - 1).toFixed(3));
        svg.style.setProperty("--py", ((e.clientY / window.innerHeight) * 2 - 1).toFixed(3));
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <svg ref={ref} className="scene" viewBox="0 0 800 600" preserveAspectRatio="xMaxYMax slice" role="img" aria-label="Learners walking to school as the school bus pulls in">
      <defs>
        <linearGradient id="sc-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={stop("--sc-sky-top")} />
          <stop offset="0.62" style={stop("--sc-sky-mid")} />
          <stop offset="1" style={stop("--sc-sky-low")} />
        </linearGradient>
        <radialGradient id="sc-sunglow">
          <stop offset="0" style={stop("--sc-sun")} stopOpacity="0.55" />
          <stop offset="1" style={stop("--sc-sun")} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sc-hill-far" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={stop("--sc-hill-far")} /><stop offset="1" style={stop("--sc-hill-far-2")} /></linearGradient>
        <linearGradient id="sc-hill-mid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={stop("--sc-hill-mid")} /><stop offset="1" style={stop("--sc-hill-mid-2")} /></linearGradient>
        <linearGradient id="sc-hill-near" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={stop("--sc-hill-near")} /><stop offset="1" style={stop("--sc-hill-near-2")} /></linearGradient>
        <linearGradient id="sc-wall" x1="0" y1="0" x2="1" y2="0"><stop offset="0" style={stop("--sc-wall")} /><stop offset="1" style={stop("--sc-wall-2")} /></linearGradient>
        <linearGradient id="sc-road" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={stop("--sc-road")} /><stop offset="1" style={stop("--sc-road-2")} /></linearGradient>
        <radialGradient id="sc-vignette" cx="0.5" cy="0.45" r="0.75"><stop offset="0.6" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity="0.22" /></radialGradient>
      </defs>

      <rect width="800" height="600" fill="url(#sc-sky)" />

      {/* far away: stars and moon (night), sun (day), clouds, birds */}
      <g className="scene-depth scene-depth-1">
        <g className="scene-night">
          {[[90, 60], [180, 140], [260, 40], [330, 110], [420, 30], [520, 90], [590, 40], [720, 70], [760, 150], [470, 160], [140, 210]].map(([x, y], i) => (
            <circle key={i} className="scene-star" cx={x} cy={y} r={i % 3 === 0 ? 1.8 : 1.2} style={{ animationDelay: `${-i * 0.7}s` }} />
          ))}
          <circle cx="640" cy="112" r="34" fill="#f3f0e6" />
          <circle cx="652" cy="104" r="30" style={v("--sc-sky-top")} opacity="0.9" />
        </g>
        <g className="scene-enter" style={{ animationDelay: "0.15s" }}>
          <g className="scene-day">
            <circle className="scene-sunglow" cx="640" cy="118" r="120" fill="url(#sc-sunglow)" />
            <circle cx="640" cy="118" r="42" style={v("--sc-sun")} />
          </g>
        </g>
        <g className="scene-cloud" style={{ animationDuration: "70s", animationDelay: "-20s" }}>
          <g style={v("--sc-cloud")} opacity="0.95"><ellipse cx="160" cy="120" rx="62" ry="18" /><ellipse cx="190" cy="104" rx="36" ry="22" /><ellipse cx="138" cy="108" rx="28" ry="16" /></g>
        </g>
        <g className="scene-cloud" style={{ animationDuration: "105s", animationDelay: "-60s" }}>
          <g style={v("--sc-cloud")} opacity="0.7"><ellipse cx="430" cy="72" rx="48" ry="13" /><ellipse cx="452" cy="61" rx="27" ry="15" /></g>
        </g>
        <g className="scene-flock">
          <Bird x={0} y={150} delay="0s" />
          <Bird x={-26} y={162} s={0.8} delay="-0.2s" />
          <Bird x={-48} y={146} s={0.7} delay="-0.35s" />
        </g>
      </g>

      {/* hills, far to near: lighter and bluer the further away */}
      <g className="scene-depth scene-depth-2 scene-enter" style={{ animationDelay: "0.25s" }}>
        <path d="M-40 334 C120 290 230 310 340 322 S560 280 840 308 V600 H-40 Z" fill="url(#sc-hill-far)" />
      </g>
      <g className="scene-depth scene-depth-3 scene-enter" style={{ animationDelay: "0.35s" }}>
        <path d="M-40 376 C150 330 300 360 430 368 S680 336 840 354 V600 H-40 Z" fill="url(#sc-hill-mid)" />
        {[60, 230, 430].map((x, i) => (
          <g key={x} className="scene-tree" style={{ animationDelay: `${-i * 1.3}s` }}>
            <rect x={x - 3.5} y="352" width="7" height="34" rx="2" style={v("--sc-trunk")} />
            <circle cx={x} cy="340" r="22" style={v("--sc-leaf")} />
            <circle cx={x + 13} cy="350" r="15" style={v("--sc-leaf-2")} />
            <circle cx={x - 12} cy="351" r="13" style={v("--sc-leaf-2")} />
          </g>
        ))}
      </g>

      {/* the school */}
      <g className="scene-depth scene-depth-4 scene-enter" style={{ animationDelay: "0.5s" }}>
        <path d="M-40 412 C200 386 420 400 560 404 S760 392 840 396 V600 H-40 Z" fill="url(#sc-hill-near)" />
        <ellipse cx="655" cy="404" rx="140" ry="10" fill="#000" opacity="0.12" />
        <rect x="540" y="250" width="230" height="152" rx="4" fill="url(#sc-wall)" />
        <polygon points="526,254 655,186 784,254" style={v("--sc-roof")} />
        <polygon points="526,254 655,186 655,254" fill="#fff" opacity="0.08" />
        <rect x="540" y="254" width="230" height="7" fill="#000" opacity="0.08" />
        <rect x="624" y="318" width="42" height="84" rx="4" style={v("--sc-door")} />
        <circle cx="658" cy="362" r="2.2" fill="#e8c26a" />
        <circle cx="655" cy="222" r="13" fill="#fff" stroke="#7a4b2a" strokeWidth="2" />
        <g className="scene-clock"><line x1="655" y1="222" x2="655" y2="213" stroke="#333" strokeWidth="2" strokeLinecap="round" /></g>
        <line x1="655" y1="222" x2="661" y2="222" stroke="#333" strokeWidth="2" strokeLinecap="round" />
        {[560, 690, 730].flatMap((x) => [280, 335].map((y) => (
          <g key={`${x}-${y}`}>
            <rect x={x} y={y} width="28" height="26" rx="3" style={v("--sc-window")} />
            <rect x={x} y={y} width="28" height="26" rx="3" className="scene-window-light" />
            <rect x={x + 3} y={y + 3} width="8" height="20" rx="2" fill="#fff" opacity="0.25" />
          </g>
        )))}
        <rect x="585" y="402" width="140" height="7" rx="2" style={v("--sc-step")} />
        <line x1="526" y1="402" x2="526" y2="228" stroke="#8d93a0" strokeWidth="4" strokeLinecap="round" />
        <g className="scene-flag">
          <rect x="528" y="230" width="40" height="8" fill="#111" />
          <rect x="528" y="238" width="40" height="3" fill="#fff" />
          <rect x="528" y="241" width="40" height="8" fill="#bb0000" />
          <rect x="528" y="249" width="40" height="3" fill="#fff" />
          <rect x="528" y="252" width="40" height="8" fill="#006600" />
        </g>
      </g>

      {/* the path to school, then the road */}
      <g className="scene-enter" style={{ animationDelay: "0.6s" }}>
        <rect x="0" y="428" width="800" height="28" style={v("--sc-path")} />
        <rect x="0" y="428" width="800" height="3" fill="#fff" opacity="0.18" />
        <rect x="0" y="456" width="800" height="144" fill="url(#sc-road)" />
        {Array.from({ length: 12 }, (_, i) => <rect key={i} x={i * 80 + 10} y="524" width="42" height="5" rx="2.5" fill="#f5f5f5" opacity="0.75" />)}
      </g>

      {/* learners walking up to the school door */}
      <g transform="translate(0 446)">
        <Kid shirt="#2952cc" bag="#f39c12" skin="#7a5236" hair="#21170f" delay="0s" />
        <Kid shirt="#d0453a" bag="#16a085" skin="#5e3d27" hair="#1a120c" delay="-1.4s" scale={0.88} />
        <Kid shirt="#0f9d76" bag="#8e44ad" skin="#8a5c3c" hair="#2b1d14" delay="-3s" scale={0.95} />
      </g>

      {/* the school bus pulls in, stops at the school, and drives on */}
      <g className="scene-bus">
        <g transform="translate(0 468)">
          <ellipse cx="96" cy="90" rx="100" ry="6" fill="#000" opacity="0.25" />
          <g className="scene-exhaust">
            <circle cx="-6" cy="66" r="5" /><circle cx="-14" cy="62" r="4" /><circle cx="-22" cy="57" r="3" />
          </g>
          <g className="scene-suspension">
            <rect x="0" y="0" width="190" height="74" rx="14" fill="#ffc21a" />
            <rect x="0" y="0" width="190" height="10" rx="6" fill="#fff" opacity="0.18" />
            <rect x="150" y="18" width="44" height="40" rx="8" fill="#ffc21a" />
            <rect x="0" y="44" width="194" height="6" fill="#1d1d1d" opacity="0.8" />
            {[14, 50, 86, 122].map((x) => <rect key={x} x={x} y="11" width="28" height="24" rx="4" style={v("--sc-busglass")} />)}
            <rect x="160" y="11" width="26" height="27" rx="4" style={v("--sc-busglass")} />
            <text x="58" y="64" fontSize="11" fontWeight="800" fill="#1d1d1d" fontFamily="system-ui, sans-serif" letterSpacing="1">SCHOOL BUS</text>
            <circle cx="190" cy="58" r="4.5" className="scene-headlight" />
            <rect x="-2" y="56" width="5" height="8" rx="2" fill="#d63b2e" />
          </g>
          {[40, 150].map((x) => (
            <g key={x} className="scene-wheel">
              <circle cx={x} cy="76" r="15" fill="#1d1d1d" />
              <circle cx={x} cy="76" r="7" fill="#c9ccd3" />
              <rect x={x - 1.5} y="63" width="3" height="9" rx="1.5" fill="#c9ccd3" />
            </g>
          ))}
        </g>
      </g>

      <rect width="800" height="600" fill="url(#sc-vignette)" pointerEvents="none" />
    </svg>
  );
}
