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

export const OutroCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Fade in from black
  const fadeIn = interpolate(frame, [0, 25], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Background video slow reveal
  const videoOpacity = interpolate(frame, [0, 35], [0, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Logo springs in
  const logoScale = spring({
    frame: frame - 20,
    fps,
    config: { damping: 14, stiffness: 120 },
  });
  const logoOpacity = interpolate(frame, [15, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // CTA fades in
  const ctaOpacity = interpolate(frame, [50, 70], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ctaY = interpolate(frame, [50, 70], [12, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // URL fades in
  const urlOpacity = interpolate(frame, [70, 85], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // CTA button pulse
  const btnScale = spring({
    frame: frame - 85,
    fps,
    config: { damping: 10, stiffness: 120 },
  });
  const btnOpacity = interpolate(frame, [80, 95], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const btnGlow = Math.sin(frame * 0.1) * 0.3 + 0.7;

  // Subtle scale-down on end
  const endScale = interpolate(
    frame,
    [durationInFrames - 15, durationInFrames],
    [1, 0.98],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", opacity: fadeIn }}>
      {/* Ken Burns dispensary background */}
      <AbsoluteFill style={{ opacity: videoOpacity }}>
        <OffthreadVideo
          src={staticFile("outro-cinematic.mp4")}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          muted
        />
      </AbsoluteFill>

      {/* Dark overlay */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(13,13,13,0.6) 0%, rgba(13,13,13,0.85) 70%)",
        }}
      />

      {/* Content */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          transform: `scale(${endScale})`,
        }}
      >
        {/* Logo */}
        <Img
          src={staticFile("logo.png")}
          style={{
            width: 380,
            transform: `scale(${logoScale})`,
            opacity: logoOpacity,
            filter: "drop-shadow(0 4px 24px rgba(0,0,0,0.5))",
          }}
        />

        {/* Accent line */}
        <div
          style={{
            width: 180,
            height: 2,
            background:
              "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
            marginTop: 26,
            marginBottom: 26,
            opacity: logoOpacity,
          }}
        />

        {/* CTA */}
        <div
          style={{
            opacity: ctaOpacity,
            transform: `translateY(${ctaY}px)`,
            fontSize: 34,
            fontWeight: 600,
            color: "white",
            fontFamily: interFont,
            textAlign: "center",
            textShadow: "0 2px 12px rgba(0,0,0,0.6)",
          }}
        >
          Modern POS for Cannabis Retail
        </div>

        {/* URL */}
        <div
          style={{
            opacity: urlOpacity,
            marginTop: 24,
            fontSize: 26,
            fontWeight: 400,
            color: "rgba(255, 255, 255, 0.7)",
            fontFamily: interFont,
            textAlign: "center",
            letterSpacing: "0.04em",
            textShadow: "0 2px 8px rgba(0,0,0,0.5)",
          }}
        >
          brotherpos.ca
        </div>

        {/* CTA Button */}
        <div
          style={{
            opacity: btnOpacity,
            marginTop: 36,
            transform: `scale(${btnScale})`,
          }}
        >
          <div
            style={{
              background: `linear-gradient(135deg, rgba(34,197,94,${btnGlow}), rgba(22,163,74,${btnGlow}))`,
              padding: "16px 48px",
              borderRadius: 12,
              fontSize: 22,
              fontWeight: 700,
              fontFamily: interFont,
              color: "white",
              letterSpacing: "0.02em",
              boxShadow: `0 0 30px rgba(34,197,94,${btnGlow * 0.4}), 0 4px 20px rgba(0,0,0,0.4)`,
              textAlign: "center",
            }}
          >
            Book a Free Demo
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
