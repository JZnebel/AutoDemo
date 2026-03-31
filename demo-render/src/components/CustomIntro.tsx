import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Img,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
  staticFile,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
import { loadFont as loadSerif } from "@remotion/google-fonts/DMSerifDisplay";

/**
 * Custom Intro for RezWeed — earthy, organic, map-inspired.
 *
 * Warm background with topographic contour lines, the logo rises
 * from the earth, tagline words stagger in one at a time, a compass
 * rose accent spins subtly, and stat counters tick up.
 */

const { fontFamily: interFont } = loadFont("normal", {
  weights: ["400", "600", "700"],
  subsets: ["latin"],
});
const { fontFamily: serifFont } = loadSerif("normal", {
  weights: ["400"],
  subsets: ["latin"],
});

export type IntroCardProps = {
  tagline?: string;
  subtitle?: string;
  logoSrc?: string;
  videoSrc?: string;
  accentColor?: string;
};

function parseAccent(color: string) {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) return { r: +match[1], g: +match[2], b: +match[3] };
  return { r: 45, g: 74, b: 62 };
}

// Topographic contour lines — deterministic curves
function topoLines(count: number) {
  const lines = [];
  for (let i = 0; i < count; i++) {
    const h = Math.sin(i * 7.234 + 3.1) * 43758.5453;
    const yBase = 15 + ((h - Math.floor(h)) * 70);
    const amp = 8 + ((Math.sin(i * 2.71) * 0.5 + 0.5) * 25);
    const freq = 0.003 + ((Math.sin(i * 4.56) * 0.5 + 0.5) * 0.004);
    const phase = i * 1.7;
    lines.push({ yBase, amp, freq, phase, opacity: 0.04 + (i % 3) * 0.02 });
  }
  return lines;
}

const TOPO = topoLines(12);

export const CustomIntro: React.FC<IntroCardProps> = ({
  tagline = "Find Native Dispensaries Near You",
  subtitle = "RezWeed",
  logoSrc,
  accentColor = "rgba(45,74,62,1)",
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const accent = useMemo(() => parseAccent(accentColor), [accentColor]);

  const resolvedLogoSrc = useMemo(() => {
    if (logoSrc) {
      try { return staticFile(logoSrc); } catch { return logoSrc; }
    }
    return "";
  }, [logoSrc]);

  // ── Background: warm earth tone, not cold tech ──────────────────
  const bgShift = interpolate(frame, [0, durationInFrames], [0, 8]);

  // ── Topographic contour lines fade in ───────────────────────────
  const topoOpacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Logo: rises from bottom with blur clear ─────────────────────
  const logoProgress = spring({
    frame: frame - 5,
    fps,
    config: { damping: 14, stiffness: 80 },
  });
  const logoY = interpolate(logoProgress, [0, 1], [80, 0]);
  const logoBlur = interpolate(logoProgress, [0, 1], [12, 0]);
  const logoOpacity = interpolate(frame, [5, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Tagline: words stagger in one at a time ─────────────────────
  const tagWords = tagline.split(" ");
  const tagStartFrame = 35;
  const wordInterval = 4; // frames between each word

  // ── Accent underline wipe ───────────────────────────────────────
  const underlineDelay = tagStartFrame + tagWords.length * wordInterval + 5;
  const underlineProgress = spring({
    frame: frame - underlineDelay,
    fps,
    config: { damping: 200 },
    durationInFrames: 25,
  });

  // ── Subtitle fade ──────────────────────────────────────────────
  const subDelay = underlineDelay + 10;
  const subOpacity = interpolate(frame, [subDelay, subDelay + 15], [0, 0.7], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Stat counter: "863 dispensaries • 277 reserves" ─────────────
  const statDelay = subDelay + 8;
  const statOpacity = interpolate(frame, [statDelay, statDelay + 12], [0, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const storeCount = Math.min(863, Math.floor(interpolate(
    frame, [statDelay, statDelay + 20], [0, 863],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  )));
  const reserveCount = Math.min(277, Math.floor(interpolate(
    frame, [statDelay, statDelay + 20], [0, 277],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  )));

  // ── Compass rose accent — slow spin ─────────────────────────────
  const compassAngle = interpolate(frame, [0, durationInFrames], [0, 45]);
  const compassOpacity = interpolate(frame, [15, 40], [0, 0.06], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Global fade out (hold long enough to read) ──────────────────
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 12, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${160 + bgShift}deg, #1a1c18 0%, #2a3428 30%, rgb(${accent.r},${accent.g},${accent.b}) 70%, #1a2018 100%)`,
        opacity: fadeOut,
      }}
    >
      {/* Topographic contour lines */}
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", opacity: topoOpacity }}
      >
        {TOPO.map((line, i) => {
          const drift = Math.sin(frame * 0.01 + line.phase) * 5;
          const points = [];
          for (let x = 0; x <= width; x += 8) {
            const y =
              (line.yBase / 100) * height +
              Math.sin(x * line.freq + line.phase + frame * 0.005) * line.amp +
              drift;
            points.push(`${x},${y}`);
          }
          return (
            <polyline
              key={i}
              points={points.join(" ")}
              fill="none"
              stroke={`rgba(255,255,255,${line.opacity})`}
              strokeWidth={1}
            />
          );
        })}
      </svg>

      {/* Compass rose — large, subtle, in the corner */}
      <div
        style={{
          position: "absolute",
          right: 120,
          top: 120,
          width: 300,
          height: 300,
          opacity: compassOpacity,
          transform: `rotate(${compassAngle}deg)`,
        }}
      >
        <svg viewBox="0 0 100 100" width={300} height={300}>
          {/* Simple compass cross */}
          <line x1="50" y1="5" x2="50" y2="95" stroke="white" strokeWidth="0.5" />
          <line x1="5" y1="50" x2="95" y2="50" stroke="white" strokeWidth="0.5" />
          <line x1="20" y1="20" x2="80" y2="80" stroke="white" strokeWidth="0.3" />
          <line x1="80" y1="20" x2="20" y2="80" stroke="white" strokeWidth="0.3" />
          <circle cx="50" cy="50" r="35" fill="none" stroke="white" strokeWidth="0.5" />
          <circle cx="50" cy="50" r="2" fill="white" />
          {/* N marker */}
          <text x="50" y="14" textAnchor="middle" fill="white" fontSize="6" fontFamily="sans-serif">N</text>
        </svg>
      </div>

      {/* Main content */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
        }}
      >
        {/* Logo — rises up with blur clear */}
        {resolvedLogoSrc ? (
          <Img
            src={resolvedLogoSrc}
            style={{
              width: 320,
              opacity: logoOpacity,
              transform: `translateY(${logoY}px)`,
              filter: `blur(${logoBlur}px) drop-shadow(0 8px 40px rgba(0,0,0,0.4))`,
            }}
          />
        ) : null}

        {/* Tagline — words stagger in */}
        <div
          style={{
            marginTop: resolvedLogoSrc ? 36 : 0,
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "0 12px",
            maxWidth: 900,
          }}
        >
          {tagWords.map((word, i) => {
            const wordFrame = tagStartFrame + i * wordInterval;
            const wordSpring = spring({
              frame: frame - wordFrame,
              fps,
              config: { damping: 18, stiffness: 140 },
            });
            const wordOpacity = interpolate(
              frame,
              [wordFrame, wordFrame + 8],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            );
            const wordY = interpolate(wordSpring, [0, 1], [18, 0]);

            return (
              <span
                key={i}
                style={{
                  fontSize: 52,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.95)",
                  fontFamily: serifFont,
                  letterSpacing: "-0.01em",
                  opacity: wordOpacity,
                  transform: `translateY(${wordY}px)`,
                  display: "inline-block",
                }}
              >
                {word}
              </span>
            );
          })}
        </div>

        {/* Accent underline */}
        <div
          style={{
            marginTop: 20,
            width: 240,
            height: 2,
            borderRadius: 1,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              background: `linear-gradient(90deg, rgba(${accent.r},${accent.g},${accent.b},0.9), rgba(255,255,255,0.3))`,
              transformOrigin: "left center",
              transform: `scaleX(${underlineProgress})`,
            }}
          />
        </div>

        {/* Subtitle */}
        {subtitle ? (
          <div
            style={{
              marginTop: 22,
              fontSize: 18,
              fontWeight: 400,
              color: `rgba(255,255,255,${subOpacity})`,
              fontFamily: interFont,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {subtitle}
          </div>
        ) : null}

        {/* Stat counters */}
        <div
          style={{
            marginTop: 32,
            display: "flex",
            gap: 40,
            opacity: statOpacity,
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: 36,
                fontWeight: 700,
                color: `rgb(${accent.r + 60},${accent.g + 60},${accent.b + 40})`,
                fontFamily: interFont,
              }}
            >
              {storeCount}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.4)",
                fontFamily: interFont,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginTop: 4,
              }}
            >
              dispensaries
            </div>
          </div>
          <div
            style={{
              width: 1,
              background: "rgba(255,255,255,0.1)",
              alignSelf: "stretch",
            }}
          />
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: 36,
                fontWeight: 700,
                color: `rgb(${accent.r + 60},${accent.g + 60},${accent.b + 40})`,
                fontFamily: interFont,
              }}
            >
              {reserveCount}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.4)",
                fontFamily: interFont,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginTop: 4,
              }}
            >
              reserves
            </div>
          </div>
        </div>
      </AbsoluteFill>

      {/* Subtle warm vignette */}
      <AbsoluteFill
        style={{
          background:
            `radial-gradient(ellipse at center, transparent 30%, rgba(${Math.max(0, accent.r - 20)},${Math.max(0, accent.g - 30)},${Math.max(0, accent.b - 20)},0.5) 100%)`,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
