import React from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  staticFile,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily: interFont } = loadFont("normal", {
  weights: ["400", "600", "700"],
  subsets: ["latin"],
});

/**
 * TransitionCard — cinematic section break with Sora background video,
 * animated logo, and staggered text reveals.
 */
export const TransitionCard: React.FC<{
  heading?: string;
  subtitle?: string;
}> = ({ heading = "Admin Dashboard", subtitle = "Managing Everything Behind the Scenes" }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // ── Logo entrance ──
  const logoScale = spring({
    frame: frame - 8,
    fps,
    config: { damping: 14, stiffness: 90 },
  });
  const logoOpacity = interpolate(frame, [5, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const logoY = interpolate(logoScale, [0, 1], [30, 0]);

  // ── Heading slide up ──
  const headDelay = 18;
  const headProgress = spring({
    frame: frame - headDelay,
    fps,
    config: { damping: 16, stiffness: 80 },
  });
  const headOpacity = interpolate(frame, [headDelay, headDelay + 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const headY = interpolate(headProgress, [0, 1], [25, 0]);

  // ── Separator line grows ──
  const sepW = interpolate(frame, [headDelay + 8, headDelay + 30], [0, 320], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Subtitle fade up ──
  const subDelay = 35;
  const subOpacity = interpolate(frame, [subDelay, subDelay + 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const subY = interpolate(frame, [subDelay, subDelay + 15], [15, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Global fade out ──
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 15, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#050a08", opacity: fadeOut }}>
      {/* Sora background video */}
      <OffthreadVideo
        src={staticFile("transition-sora.mp4")}
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: 0.55,
          filter: "brightness(0.75)",
        }}
        volume={0}
      />

      {/* Dark overlay for text readability */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(5,10,8,0.2) 0%, rgba(5,10,8,0.6) 100%)",
        }}
      />

      {/* Content */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
        }}
      >
        {/* Logo */}
        <Img
          src={staticFile("logo.png")}
          style={{
            width: 260,
            transform: `scale(${logoScale}) translateY(${logoY}px)`,
            opacity: logoOpacity,
            filter: "drop-shadow(0 4px 20px rgba(34,197,94,0.2))",
          }}
        />

        {/* Heading */}
        <div
          style={{
            opacity: headOpacity,
            transform: `translateY(${headY}px)`,
            fontSize: 56,
            fontWeight: 700,
            color: "white",
            fontFamily: interFont,
            letterSpacing: "0.02em",
            textAlign: "center",
            marginTop: 28,
            textShadow: "0 2px 20px rgba(0,0,0,0.5)",
          }}
        >
          {heading}
        </div>

        {/* Separator */}
        <div
          style={{
            width: sepW,
            height: 2,
            background:
              "linear-gradient(90deg, transparent, rgba(34,197,94,0.6), transparent)",
            marginTop: 16,
            marginBottom: 16,
          }}
        />

        {/* Subtitle */}
        <div
          style={{
            opacity: subOpacity,
            transform: `translateY(${subY}px)`,
            fontSize: 24,
            fontWeight: 400,
            color: "rgba(255,255,255,0.7)",
            fontFamily: interFont,
            letterSpacing: "0.06em",
            textAlign: "center",
            textShadow: "0 1px 10px rgba(0,0,0,0.5)",
          }}
        >
          {subtitle}
        </div>
      </AbsoluteFill>

      {/* Vignette */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
