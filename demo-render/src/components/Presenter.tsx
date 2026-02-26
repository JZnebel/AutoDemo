import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  staticFile,
} from "remotion";

export type MouthCue = {
  start: number;
  end: number;
  value: string;
};

// ── Rhubarb viseme → {open, width, round} mapping ────────────────
const VISEME_SHAPES: Record<string, { open: number; width: number; round: number }> = {
  A: { open: 0.0,  width: 0.45, round: 0.0 },
  B: { open: 0.25, width: 0.55, round: 0.0 },
  C: { open: 0.55, width: 0.7,  round: 0.0 },
  D: { open: 0.85, width: 0.75, round: 0.0 },
  E: { open: 0.5,  width: 0.4,  round: 0.5 },
  F: { open: 0.4,  width: 0.2,  round: 0.9 },
  G: { open: 0.15, width: 0.55, round: 0.0 },
  H: { open: 0.35, width: 0.5,  round: 0.0 },
  X: { open: 0.0,  width: 0.4,  round: 0.0 },
};

/**
 * Procedural SVG mouth — bezier curves driven by {open, width, round}.
 */
function ProceduralMouth({
  shape,
}: {
  shape: { open: number; width: number; round: number };
}) {
  const svgW = 50;
  const svgH = 30;
  const cx = svgW / 2;
  const cy = svgH / 2;

  const mouthWidth =
    svgW * 0.3 + svgW * 0.5 * shape.width * (1 - shape.round * 0.4);
  const mouthHeight = Math.max(1, svgH * 0.7 * shape.open);

  const halfW = mouthWidth / 2;
  const halfH = mouthHeight / 2;

  const cpx = halfW * (0.6 + shape.round * 0.3);
  const cpy = halfH * (0.8 + shape.open * 0.2);

  const upperLip = `M ${cx - halfW} ${cy} C ${cx - cpx} ${cy - cpy}, ${cx + cpx} ${cy - cpy}, ${cx + halfW} ${cy}`;
  const lowerLip = `M ${cx - halfW} ${cy} C ${cx - cpx} ${cy + cpy}, ${cx + cpx} ${cy + cpy}, ${cx + halfW} ${cy}`;

  const innerScale = 0.85;
  const iHW = halfW * innerScale;
  const icpx = cpx * innerScale;
  const icpy = cpy * innerScale;
  const innerD = `M ${cx - iHW} ${cy} C ${cx - icpx} ${cy - icpy}, ${cx + icpx} ${cy - icpy}, ${cx + iHW} ${cy} C ${cx + icpx} ${cy + icpy}, ${cx - icpx} ${cy + icpy}, ${cx - iHW} ${cy} Z`;

  const teethW = halfW * 0.7;
  const teethH = Math.min(halfH * 0.3, 6);
  const teethY = cy - halfH * 0.3;
  const teethD = `M ${cx - teethW} ${teethY} Q ${cx} ${teethY + teethH}, ${cx + teethW} ${teethY} L ${cx + teethW} ${teethY + teethH * 0.5} Q ${cx} ${teethY + teethH * 1.3}, ${cx - teethW} ${teethY + teethH * 0.5} Z`;

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} width={svgW} height={svgH} overflow="visible">
      {shape.open > 0.02 && (
        <path d={innerD} fill="#3A1111" opacity={Math.min(1, shape.open * 2)} />
      )}
      {shape.open > 0.1 && (
        <path d={teethD} fill="rgba(255,255,255,0.9)" opacity={Math.min(0.9, shape.open * 1.5)} />
      )}
      <path
        d={`${upperLip} ${lowerLip}`}
        fill="none"
        stroke="#C4887A"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Half-body presenter — waist up, clean modern illustration style.
 * Shoulders flow naturally from torso, arms have subtle idle sway,
 * BrotherPOS logo on the chest.
 */
export const Presenter: React.FC<{
  side?: "left" | "right";
  mouthCues: MouthCue[];
}> = ({ side = "left", mouthCues }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentSec = frame / fps;

  // ── Find current viseme ──
  let viseme = "X";
  for (let i = mouthCues.length - 1; i >= 0; i--) {
    if (currentSec >= mouthCues[i].start) {
      viseme = mouthCues[i].value;
      break;
    }
  }

  const shape = VISEME_SHAPES[viseme] || VISEME_SHAPES.X;
  const isSpeaking = viseme !== "X" && viseme !== "A";

  // ── Entrance ──
  const entrance = spring({ frame, fps, config: { damping: 16, stiffness: 55 } });
  const slideX = side === "left"
    ? interpolate(entrance, [0, 1], [-400, 0])
    : interpolate(entrance, [0, 1], [400, 0]);

  // ── Idle animations ──
  const breathe = Math.sin(frame * 0.04) * 1.2;
  const headTilt = Math.sin(frame * 0.025) * 0.7;
  const speakNod = isSpeaking ? Math.sin(frame * 0.14) * 0.8 : 0;

  // ── Arm sway — gentle pendulum synced to breathing ──
  const leftArmSway = Math.sin(frame * 0.03) * 1.5 + breathe * 0.3;
  const rightArmSway = Math.sin(frame * 0.03 + 0.5) * 1.5 + breathe * 0.3;

  // ── Blink ──
  const bc = Math.sin(frame * 0.035) + Math.sin(frame * 0.078);
  const isBlinking = bc > 1.88;
  const eyeScaleY = isBlinking ? 0.08 : 1;

  // ── Brow ──
  const browLift = (viseme === "D" || viseme === "C") ? 2 : 0;

  const flipX = side === "right" ? -1 : 1;

  return (
    <div
      style={{
        position: "absolute",
        [side]: 0,
        bottom: -220,
        width: 480,
        height: 780,
        opacity: entrance,
        transform: `translateX(${slideX}px)`,
        pointerEvents: "none",
      }}
    >
      <svg
        viewBox="0 0 400 560"
        width={480}
        height={780}
        style={{ transform: `scaleX(${flipX})`, overflow: "visible" }}
      >
        <defs>
          <linearGradient id="p-skin" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FBDCC4" />
            <stop offset="100%" stopColor="#EDBE9E" />
          </linearGradient>
          <linearGradient id="p-skinShade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E4AD85" />
            <stop offset="100%" stopColor="#D49B72" />
          </linearGradient>
          <linearGradient id="p-hair" x1="0.3" y1="0" x2="0.7" y2="1">
            <stop offset="0%" stopColor="#3D2314" />
            <stop offset="100%" stopColor="#221008" />
          </linearGradient>
          <linearGradient id="p-shirt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#26B760" />
            <stop offset="100%" stopColor="#1D9A4C" />
          </linearGradient>
          <linearGradient id="p-shirtDark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1D9A4C" />
            <stop offset="100%" stopColor="#157A3A" />
          </linearGradient>
          <radialGradient id="p-eyeWhite" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#EDE9E3" />
          </radialGradient>
          <filter id="p-shadow">
            <feDropShadow dx="2" dy="5" stdDeviation="6" floodColor="#000" floodOpacity="0.3" />
          </filter>
          <linearGradient id="p-bottomFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#050a08" stopOpacity={0} />
            <stop offset="100%" stopColor="#050a08" stopOpacity={1} />
          </linearGradient>
          {/* Clip path to round the logo */}
          <clipPath id="p-logoClip">
            <rect x={170} y={325} width={60} height={40} rx={4} />
          </clipPath>
        </defs>

        <g transform={`translate(0, ${breathe})`}>

          {/* ══ LEFT ARM ══ */}
          <g transform={`rotate(${leftArmSway}, 128, 290)`}>
            {/* Upper arm (sleeve) — wide, overlaps into torso */}
            <path
              d="M 135 282 C 115 295, 100 330, 92 385 L 92 500 L 128 500 L 128 385 C 130 330, 135 300, 140 286 Z"
              fill="url(#p-shirt)"
            />
            {/* Sleeve hem */}
            <path d="M 92 385 Q 110 393, 128 385" fill="none" stroke="url(#p-shirtDark)" strokeWidth={2} />
          </g>

          {/* ══ RIGHT ARM ══ */}
          <g transform={`rotate(${-rightArmSway}, 272, 290)`}>
            <path
              d="M 260 286 C 265 300, 270 330, 272 385 L 272 500 L 308 500 L 308 385 C 300 330, 285 295, 265 282 Z"
              fill="url(#p-shirt)"
            />
            <path d="M 272 385 Q 290 393, 308 385" fill="none" stroke="url(#p-shirtDark)" strokeWidth={2} />
          </g>

          {/* ══ TORSO — one continuous path with natural shoulder curve ══ */}
          <path
            d={`
              M 120 295
              C 125 280, 155 268, 200 265
              C 245 268, 275 280, 280 295
              C 285 340, 288 420, 290 560
              L 110 560
              C 112 420, 115 340, 120 295
              Z
            `}
            fill="url(#p-shirt)"
            filter="url(#p-shadow)"
          />

          {/* Collar — crew neck curve */}
          <path
            d="M 168 272 Q 200 285 232 272"
            fill="none"
            stroke="url(#p-shirtDark)"
            strokeWidth={3}
            strokeLinecap="round"
          />
          {/* Collar shadow */}
          <path
            d="M 170 274 Q 200 286 230 274"
            fill="none"
            stroke="rgba(0,0,0,0.1)"
            strokeWidth={5}
            strokeLinecap="round"
          />

          {/* Shirt center seam — subtle */}
          <line x1={200} y1={286} x2={200} y2={500} stroke="url(#p-shirtDark)" strokeWidth={1} opacity={0.15} />

          {/* ══ BROTHERPOS LOGO on chest ══ */}
          <image
            href={staticFile("logo.png")}
            x={170}
            y={320}
            width={60}
            height={40}
            clipPath="url(#p-logoClip)"
            opacity={0.85}
          />

          {/* ══ NECK ══ */}
          <path
            d="M 186 255 C 186 268, 187 275, 190 282 L 210 282 C 213 275, 214 268, 214 255 Z"
            fill="url(#p-skin)"
          />
          <ellipse cx={200} cy={265} rx={14} ry={7} fill="url(#p-skinShade)" opacity={0.2} />

          {/* ══ HEAD ══ */}
          <g transform={`rotate(${headTilt + speakNod}, 200, 195)`}>
            {/* Ears — behind head */}
            <ellipse cx={135} cy={195} rx={11} ry={16} fill="url(#p-skin)" />
            <ellipse cx={135} cy={195} rx={6} ry={10} fill="url(#p-skinShade)" opacity={0.15} />
            <ellipse cx={265} cy={195} rx={11} ry={16} fill="url(#p-skin)" />
            <ellipse cx={265} cy={195} rx={6} ry={10} fill="url(#p-skinShade)" opacity={0.15} />

            {/* Face */}
            <ellipse cx={200} cy={190} rx={63} ry={72} fill="url(#p-skin)" />

            {/* Jaw shadow */}
            <ellipse cx={200} cy={232} rx={48} ry={20} fill="url(#p-skinShade)" opacity={0.1} />

            {/* Cheek blush */}
            <ellipse cx={158} cy={208} rx={13} ry={8} fill="#FFB8A8" opacity={0.18} />
            <ellipse cx={242} cy={208} rx={13} ry={8} fill="#FFB8A8" opacity={0.18} />

            {/* ── HAIR — on top, proper z-order ── */}
            {/* Main swept volume */}
            <path
              d={`
                M 137 180
                C 137 125, 155 105, 200 100
                C 245 105, 263 125, 263 180
                C 260 155, 245 142, 200 138
                C 155 142, 140 155, 137 180
                Z
              `}
              fill="url(#p-hair)"
            />
            {/* Top volume — rounded */}
            <ellipse cx={200} cy={118} rx={58} ry={30} fill="url(#p-hair)" />
            {/* Side hair removed — was overlapping face */}
            {/* Hair shine highlight */}
            <path d="M 172 108 Q 196 100 218 106" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={4} strokeLinecap="round" />

            {/* ── EYEBROWS ── */}
            <path
              d={`M 166 ${172 - browLift} Q 178 ${166 - browLift} 190 ${170 - browLift}`}
              fill="none" stroke="url(#p-hair)" strokeWidth={2.8} strokeLinecap="round"
            />
            <path
              d={`M 210 ${170 - browLift} Q 222 ${166 - browLift} 234 ${172 - browLift}`}
              fill="none" stroke="url(#p-hair)" strokeWidth={2.8} strokeLinecap="round"
            />

            {/* ── EYES ── */}
            <g transform={`translate(178, 190) scale(1, ${eyeScaleY})`}>
              <ellipse cx={0} cy={0} rx={10} ry={7.5} fill="url(#p-eyeWhite)" />
              {!isBlinking && (
                <>
                  <circle cx={1} cy={0.5} r={5} fill="#5C3A1E" />
                  <circle cx={1} cy={0.5} r={3.2} fill="#2C1810" />
                  <circle cx={3} cy={-1.5} r={1.8} fill="white" />
                </>
              )}
            </g>

            <g transform={`translate(222, 190) scale(1, ${eyeScaleY})`}>
              <ellipse cx={0} cy={0} rx={10} ry={7.5} fill="url(#p-eyeWhite)" />
              {!isBlinking && (
                <>
                  <circle cx={1} cy={0.5} r={5} fill="#5C3A1E" />
                  <circle cx={1} cy={0.5} r={3.2} fill="#2C1810" />
                  <circle cx={3} cy={-1.5} r={1.8} fill="white" />
                </>
              )}
            </g>

            {/* ── NOSE ── */}
            <path
              d="M 198 205 Q 200 214 196 219 Q 200 221 204 219 Q 200 214 202 205"
              fill="none" stroke="url(#p-skinShade)" strokeWidth={1.5} strokeLinecap="round" opacity={0.35}
            />

            {/* ── MOUTH ── */}
            <g transform="translate(175, 230)">
              <ProceduralMouth shape={shape} />
            </g>

            {/* Chin */}
            <ellipse cx={200} cy={250} rx={4} ry={2.5} fill="url(#p-skinShade)" opacity={0.08} />
          </g>
        </g>

        {/* Bottom fade — crop above forearms */}
        <rect x={0} y={370} width={400} height={60} fill="url(#p-bottomFade)" />
        <rect x={0} y={430} width={400} height={130} fill="#050a08" />
      </svg>
    </div>
  );
};
