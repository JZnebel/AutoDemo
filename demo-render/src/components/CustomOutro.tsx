import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Img,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  staticFile,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
import { loadFont as loadSerif } from "@remotion/google-fonts/DMSerifDisplay";

/**
 * Custom Outro for RezWeed — warm, inviting CTA.
 *
 * Accent color fills the screen as a bold background, logo and URL
 * are prominent, pin-drop animation for "find yours", no dark moody
 * vibes — this is a call to action, not a credits sequence.
 */

const { fontFamily: interFont } = loadFont("normal", {
  weights: ["400", "600", "700", "800"],
  subsets: ["latin"],
});
const { fontFamily: serifFont } = loadSerif("normal", {
  weights: ["400"],
  subsets: ["latin"],
});

export type OutroCardProps = {
  heading?: string;
  url?: string;
  ctaText?: string;
  logoSrc?: string;
  videoSrc?: string;
  accentColor?: string;
};

function parseAccent(color: string) {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) return { r: +match[1], g: +match[2], b: +match[3] };
  return { r: 45, g: 74, b: 62 };
}

export const CustomOutro: React.FC<OutroCardProps> = ({
  heading = "Find yours at rezweed.com",
  url = "rezweed.com",
  ctaText = "Browse Now",
  logoSrc,
  accentColor = "rgba(45,74,62,1)",
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const accent = useMemo(() => parseAccent(accentColor), [accentColor]);

  const resolvedLogoSrc = useMemo(() => {
    if (logoSrc) {
      try { return staticFile(logoSrc); } catch { return logoSrc; }
    }
    return "";
  }, [logoSrc]);

  // Lighter tint for background
  const bgR = Math.min(255, accent.r + 15);
  const bgG = Math.min(255, accent.g + 15);
  const bgB = Math.min(255, accent.b + 15);

  // ── Background wipe: accent color sweeps in from left ───────────
  const wipeProgress = spring({
    frame,
    fps,
    config: { damping: 30, stiffness: 60 },
  });
  const wipeX = interpolate(wipeProgress, [0, 1], [-110, 0]);

  // ── Map pin drops in ────────────────────────────────────────────
  const pinDelay = 15;
  const pinDrop = spring({
    frame: frame - pinDelay,
    fps,
    config: { damping: 8, stiffness: 150 },
  });
  const pinY = interpolate(pinDrop, [0, 1], [-120, 0]);
  const pinScale = interpolate(pinDrop, [0, 0.5, 1], [0.5, 1.2, 1]);
  const pinOpacity = interpolate(frame, [pinDelay, pinDelay + 5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Heading slides in ──────────────────────────────────────────
  const headDelay = 25;
  const headSpring = spring({
    frame: frame - headDelay,
    fps,
    config: { damping: 20, stiffness: 100 },
  });
  const headX = interpolate(headSpring, [0, 1], [60, 0]);
  const headOpacity = interpolate(frame, [headDelay, headDelay + 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── URL types in ───────────────────────────────────────────────
  const urlDelay = 45;
  const charsPerFrame = 0.6;
  const urlTyped = url.slice(
    0,
    Math.min(url.length, Math.max(0, Math.floor((frame - urlDelay) * charsPerFrame))),
  );
  const urlCursorOn = frame >= urlDelay && urlTyped.length < url.length;
  const urlDone = urlTyped.length >= url.length;
  const cursorBlink = urlDone ? (frame % 20 < 10 ? 1 : 0) : 1;
  const cursorFadeOut = urlDone
    ? interpolate(frame, [urlDelay + url.length / charsPerFrame + 15, urlDelay + url.length / charsPerFrame + 25], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;

  // ── CTA button springs in ─────────────────────────────────────
  const ctaDelay = 70;
  const ctaSpring = spring({
    frame: frame - ctaDelay,
    fps,
    config: { damping: 12, stiffness: 120 },
  });
  const ctaScale = interpolate(ctaSpring, [0, 1], [0.7, 1]);
  const ctaOpacity = interpolate(frame, [ctaDelay, ctaDelay + 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Gentle pulse after settled
  const ctaPulse = frame > ctaDelay + 20
    ? 1 + Math.sin((frame - ctaDelay - 20) * 0.08) * 0.02
    : 1;

  // ── Logo fades in at bottom ────────────────────────────────────
  const logoDelay = 55;
  const logoOpacity = interpolate(frame, [logoDelay, logoDelay + 15], [0, 0.8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── End scale ──────────────────────────────────────────────────
  const endScale = interpolate(
    frame,
    [durationInFrames - 10, durationInFrames],
    [1, 0.97],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const endOpacity = interpolate(
    frame,
    [durationInFrames - 8, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0c0a", opacity: endOpacity }}>
      {/* Accent color background — wipes in from left */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background: `linear-gradient(135deg, rgb(${bgR},${bgG},${bgB}) 0%, rgb(${accent.r},${accent.g},${accent.b}) 60%, rgb(${Math.max(0, accent.r - 10)},${Math.max(0, accent.g - 10)},${Math.max(0, accent.b - 10)}) 100%)`,
          transform: `translateX(${wipeX}%)`,
        }}
      />

      {/* Subtle texture overlay */}
      <AbsoluteFill
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
          opacity: 0.5,
        }}
      />

      {/* Content */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
          transform: `scale(${endScale})`,
        }}
      >
        {/* Map pin icon */}
        <div
          style={{
            opacity: pinOpacity,
            transform: `translateY(${pinY}px) scale(${pinScale})`,
            marginBottom: 24,
          }}
        >
          <svg width="48" height="60" viewBox="0 0 24 30">
            <path
              d="M12 0C5.4 0 0 5.4 0 12c0 9 12 18 12 18s12-9 12-18C24 5.4 18.6 0 12 0z"
              fill="white"
              fillOpacity="0.9"
            />
            <circle cx="12" cy="12" r="5" fill={`rgb(${accent.r},${accent.g},${accent.b})`} />
          </svg>
        </div>

        {/* Heading — slides in from right */}
        <div
          style={{
            opacity: headOpacity,
            transform: `translateX(${headX}px)`,
            fontSize: 48,
            fontWeight: 400,
            color: "white",
            fontFamily: serifFont,
            textAlign: "center",
            textShadow: "0 2px 20px rgba(0,0,0,0.3)",
          }}
        >
          {heading}
        </div>

        {/* URL — typewriter */}
        <div
          style={{
            marginTop: 28,
            fontSize: 32,
            fontWeight: 700,
            color: "rgba(255,255,255,0.95)",
            fontFamily: interFont,
            letterSpacing: "0.02em",
            display: "flex",
            alignItems: "center",
          }}
        >
          <span>{urlTyped}</span>
          {(urlCursorOn || (urlDone && cursorFadeOut > 0)) && (
            <span
              style={{
                opacity: cursorBlink * cursorFadeOut,
                color: "rgba(255,255,255,0.8)",
                fontWeight: 300,
                marginLeft: 1,
              }}
            >
              |
            </span>
          )}
        </div>

        {/* CTA button — white on accent */}
        {ctaText ? (
          <div
            style={{
              marginTop: 36,
              opacity: ctaOpacity,
              transform: `scale(${ctaScale * ctaPulse})`,
            }}
          >
            <div
              style={{
                background: "white",
                color: `rgb(${accent.r},${accent.g},${accent.b})`,
                padding: "16px 52px",
                borderRadius: 50,
                fontSize: 20,
                fontWeight: 800,
                fontFamily: interFont,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
              }}
            >
              {ctaText}
            </div>
          </div>
        ) : null}

        {/* Logo — small, at the bottom */}
        {resolvedLogoSrc ? (
          <Img
            src={resolvedLogoSrc}
            style={{
              position: "absolute",
              bottom: 60,
              width: 180,
              opacity: logoOpacity,
              filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.3))",
            }}
          />
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
