import React, { useMemo } from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

/**
 * ChapterCard — Cinematic segment divider for demo videos.
 *
 * Apple Keynote-style chapter title that plays between demo segments.
 * Number badge springs in → title typewriters across → accent underline wipes →
 * everything slides out. Designed for ~60-90 frame duration at 30fps.
 */

const { fontFamily: interFont } = loadFont("normal", {
  weights: ["300", "400", "600", "700", "900"],
  subsets: ["latin"],
});

export type ChapterCardProps = {
  /** Chapter number (displayed in accent-colored badge) */
  chapterNumber: number;
  /** Chapter title — the scene label */
  title: string;
  /** Optional subtitle (e.g. "Setting up the store") */
  subtitle?: string;
  /** Brand accent color in rgba() format */
  accentColor?: string;
};

/** Parse rgba/rgb string to {r,g,b} */
function parseAccent(color: string) {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) return { r: match[1], g: match[2], b: match[3] };
  return { r: "34", g: "197", b: "94" };
}

// Deterministic particles (same as IntroCard pattern)
function seededDots(count: number) {
  const dots = [];
  for (let i = 0; i < count; i++) {
    const h1 = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
    const h2 = Math.sin(i * 43.2312 + 11.832) * 28472.3219;
    const h3 = Math.sin(i * 67.123 + 33.456) * 19283.1234;
    dots.push({
      x: (h1 - Math.floor(h1)) * 100,
      y: (h2 - Math.floor(h2)) * 100,
      size: 1 + (h3 - Math.floor(h3)) * 2.5,
      phase: i * 0.7,
      speed: 0.3 + (h1 - Math.floor(h1)) * 0.5,
    });
  }
  return dots;
}

const DOTS = seededDots(25);

export const ChapterCard: React.FC<ChapterCardProps> = ({
  chapterNumber = 1,
  title = "Getting Started",
  subtitle,
  accentColor = "rgba(34,197,94,1)",
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width } = useVideoConfig();
  const accent = useMemo(() => parseAccent(accentColor), [accentColor]);

  // ── Phase timing ──────────────────────────────────────────────────
  // Entrance: 0 → 20 frames
  // Hold: 20 → exit-start
  // Exit: last 15 frames
  const exitStart = durationInFrames - 15;

  // ── Background ─────────────��──────────────────────────────────────
  const bgOpacity = interpolate(
    frame,
    [0, 8, exitStart, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // ── Number badge — springs in with bounce ─────────────────────────
  const badgeSpring = spring({
    frame,
    fps,
    config: { damping: 10, stiffness: 120 },
  });
  const badgeScale = interpolate(badgeSpring, [0, 1], [0, 1]);
  const badgeRotate = interpolate(badgeSpring, [0, 1], [-15, 0]);
  // Exit: slide up
  const badgeExitY = interpolate(
    frame,
    [exitStart, durationInFrames],
    [0, -60],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const badgeExitOp = interpolate(
    frame,
    [exitStart, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // ── Title — typewriter effect ───────────────────���─────────────────
  const typeStartFrame = 8;
  const charsPerFrame = 0.8; // ~24 chars/sec at 30fps
  const typedLength = Math.min(
    title.length,
    Math.max(0, Math.floor((frame - typeStartFrame) * charsPerFrame)),
  );
  const displayedTitle = title.slice(0, typedLength);
  const cursorVisible =
    frame >= typeStartFrame && typedLength < title.length
      ? 1
      : frame % 16 < 8
        ? 1
        : 0;
  // After typing completes, cursor blinks then disappears
  const typingDone = typedLength >= title.length;
  const cursorOpacity = typingDone
    ? interpolate(frame, [typeStartFrame + title.length / charsPerFrame, typeStartFrame + title.length / charsPerFrame + 20], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }) * (frame % 16 < 8 ? 1 : 0)
    : cursorVisible;

  // Title exit
  const titleExitX = interpolate(
    frame,
    [exitStart, durationInFrames],
    [0, 80],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.quad),
    },
  );
  const titleExitOp = interpolate(
    frame,
    [exitStart, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // ── Accent underline — wipes left to right after title types ──────
  const underlineDelay = typeStartFrame + title.length / charsPerFrame + 2;
  const underlineProgress = spring({
    frame: frame - underlineDelay,
    fps,
    config: { damping: 200 },
    durationInFrames: 20,
  });

  // ── Subtitle fade in ──────────────────────────────────────────────
  const subDelay = underlineDelay + 5;
  const subOpacity = interpolate(
    frame,
    [subDelay, subDelay + 12],
    [0, 0.6],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const subY = interpolate(frame, [subDelay, subDelay + 12], [8, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Horizontal scan line (cinematic flair) ──────────────────��─────
  const scanX = interpolate(frame, [3, 25], [-200, width + 200], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });
  const scanOpacity = interpolate(frame, [3, 10, 20, 25], [0, 0.6, 0.6, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Particle dots ─────────────────────────────────────────────────
  const dotOpacity = interpolate(frame, [5, 20, exitStart, durationInFrames], [0, 0.4, 0.4, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, #0a0a0a 0%, #0d1a12 40%, #0a0a0a 100%)`,
        opacity: bgOpacity,
        fontFamily: interFont,
      }}
    >
      {/* Ambient particles */}
      {DOTS.map((d, i) => {
        const dx = Math.sin(frame * 0.02 * d.speed + d.phase) * 12;
        const dy = Math.cos(frame * 0.015 * d.speed + d.phase) * 10;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${d.x}%`,
              top: `${d.y}%`,
              width: d.size,
              height: d.size,
              borderRadius: "50%",
              backgroundColor: `rgba(${accent.r},${accent.g},${accent.b},0.4)`,
              boxShadow: `0 0 ${d.size * 4}px rgba(${accent.r},${accent.g},${accent.b},0.15)`,
              opacity: dotOpacity,
              transform: `translate(${dx}px, ${dy}px)`,
              pointerEvents: "none",
            }}
          />
        );
      })}

      {/* Horizontal scan line */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: scanX,
          width: 200,
          height: 1,
          background: `linear-gradient(90deg, transparent, rgba(${accent.r},${accent.g},${accent.b},0.8), transparent)`,
          opacity: scanOpacity,
          filter: `blur(0.5px)`,
          boxShadow: `0 0 15px rgba(${accent.r},${accent.g},${accent.b},0.3)`,
          pointerEvents: "none",
        }}
      />

      {/* Corner accents */}
      {[
        { top: 50, left: 50 },
        { top: 50, right: 50 },
        { bottom: 50, left: 50 },
        { bottom: 50, right: 50 },
      ].map((pos, i) => {
        const cornerOp = interpolate(frame, [10 + i * 3, 25 + i * 3], [0, 0.12], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const isTop = "top" in pos;
        const isLeft = "left" in pos;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              ...pos,
              width: 30,
              height: 30,
              ...(isTop ? { borderTop: `1.5px solid rgba(${accent.r},${accent.g},${accent.b},0.4)` } : { borderBottom: `1.5px solid rgba(${accent.r},${accent.g},${accent.b},0.4)` }),
              ...(isLeft ? { borderLeft: `1.5px solid rgba(${accent.r},${accent.g},${accent.b},0.4)` } : { borderRight: `1.5px solid rgba(${accent.r},${accent.g},${accent.b},0.4)` }),
              opacity: cornerOp,
            } as React.CSSProperties}
          />
        );
      })}

      {/* Main content — centered */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
        }}
      >
        {/* Chapter number badge */}
        <div
          style={{
            transform: `scale(${badgeScale}) rotate(${badgeRotate}deg) translateY(${badgeExitY}px)`,
            opacity: badgeExitOp,
            marginBottom: 28,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: `linear-gradient(135deg, rgba(${accent.r},${accent.g},${accent.b},0.9), rgba(${accent.r},${accent.g},${accent.b},0.6))`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              fontWeight: 900,
              color: "white",
              boxShadow: `0 8px 32px rgba(${accent.r},${accent.g},${accent.b},0.3), 0 0 0 1px rgba(255,255,255,0.1) inset`,
            }}
          >
            {chapterNumber}
          </div>
        </div>

        {/* Title with typewriter */}
        <div
          style={{
            transform: `translateX(${titleExitX}px)`,
            opacity: titleExitOp,
            display: "flex",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: 64,
              fontWeight: 700,
              color: "rgba(255,255,255,0.95)",
              letterSpacing: "-0.02em",
              whiteSpace: "pre",
            }}
          >
            {displayedTitle}
          </span>
          {/* Blinking cursor */}
          <span
            style={{
              fontSize: 64,
              fontWeight: 300,
              color: `rgba(${accent.r},${accent.g},${accent.b},0.9)`,
              opacity: cursorOpacity,
              marginLeft: 2,
            }}
          >
            |
          </span>
        </div>

        {/* Accent underline wipe */}
        <div
          style={{
            marginTop: 16,
            width: 320,
            height: 3,
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              background: `linear-gradient(90deg, rgba(${accent.r},${accent.g},${accent.b},0.8), rgba(${accent.r},${accent.g},${accent.b},0.3))`,
              transformOrigin: "left center",
              transform: `scaleX(${underlineProgress})`,
            }}
          />
        </div>

        {/* Subtitle */}
        {subtitle ? (
          <div
            style={{
              marginTop: 20,
              fontSize: 22,
              fontWeight: 400,
              color: `rgba(255,255,255,${subOpacity})`,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              transform: `translateY(${subY}px)`,
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </AbsoluteFill>

      {/* Vignette */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
