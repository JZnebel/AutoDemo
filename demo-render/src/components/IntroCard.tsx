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

/**
 * Motion-graphics intro card.
 * Animated gradient background, floating accent shapes, logo spring-in,
 * staggered text reveals — pure Remotion, no external video needed.
 */
const { fontFamily: interFont } = loadFont("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

// Generate deterministic particle positions from a seed
function seededParticles(count: number) {
  const particles = [];
  for (let i = 0; i < count; i++) {
    const hash = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
    const x = ((hash - Math.floor(hash)) * 100);
    const hash2 = Math.sin(i * 43.2312 + 11.832) * 28472.3219;
    const y = ((hash2 - Math.floor(hash2)) * 100);
    const hash3 = Math.sin(i * 67.123 + 33.456) * 19283.1234;
    const size = 1 + ((hash3 - Math.floor(hash3)) * 3);
    const speed = 0.2 + ((hash - Math.floor(hash)) * 0.8);
    const phase = i * 1.3;
    particles.push({ x, y, size, speed, phase });
  }
  return particles;
}

const PARTICLES = seededParticles(40);

export const IntroCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // ── Background gradient shift ──────────────────────────────────────────
  const gradAngle = interpolate(frame, [0, durationInFrames], [135, 155], {
    extrapolateRight: "clamp",
  });
  const bg = `linear-gradient(${gradAngle}deg, #0a0a0a 0%, #0d1a12 35%, #0a0a0a 70%, #111 100%)`;

  // ── Floating accent orbs (ambient motion) ──────────────────────────────
  const orbs = [
    { x: 15, y: 25, size: 320, color: "rgba(34,197,94,0.06)", speed: 0.4, phase: 0 },
    { x: 75, y: 65, size: 260, color: "rgba(34,197,94,0.04)", speed: 0.3, phase: 2 },
    { x: 50, y: 80, size: 400, color: "rgba(34,197,94,0.03)", speed: 0.25, phase: 4 },
    { x: 85, y: 20, size: 180, color: "rgba(255,255,255,0.02)", speed: 0.35, phase: 1 },
  ];

  // ── Horizontal accent lines ────────────────────────────────────────────
  const line1W = interpolate(frame, [20, 55], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const line2W = interpolate(frame, [30, 65], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Logo animation ────────────────────────────────────────────────────
  const logoScale = spring({
    frame: frame - 10,
    fps,
    config: { damping: 13, stiffness: 100 },
  });
  const logoOpacity = interpolate(frame, [8, 25], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Tagline reveal ────────────────────────────────────────────────────
  const tagDelay = 40;
  const tagOpacity = interpolate(frame, [tagDelay, tagDelay + 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const tagY = interpolate(frame, [tagDelay, tagDelay + 18], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Separator line grows from center ──────────────────────────────────
  const sepW = interpolate(frame, [tagDelay + 10, tagDelay + 35], [0, 280], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Subtitle text ─────────────────────────────────────────────────────
  const subDelay = 70;
  const subOpacity = interpolate(frame, [subDelay, subDelay + 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const subY = interpolate(frame, [subDelay, subDelay + 18], [12, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Corner accent brackets ────────────────────────────────────────────
  const bracketOpacity = interpolate(frame, [15, 40], [0, 0.15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const bracketScale = spring({
    frame: frame - 15,
    fps,
    config: { damping: 18, stiffness: 60 },
  });

  // ── Global fade out at end ────────────────────────────────────────────
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 20, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // ── Particle field ────────────────────────────────────────────────────
  const particleOpacity = interpolate(frame, [5, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: bg, opacity: fadeOut }}>
      {/* Sora dispensary video background */}
      <OffthreadVideo
        src={staticFile("intro-sora.mp4")}
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: 0.35,
          filter: "brightness(0.7)",
        }}
        volume={0}
      />

      {/* Floating orbs */}
      {orbs.map((orb, i) => {
        const drift = Math.sin((frame * orb.speed * 0.05) + orb.phase) * 30;
        const driftY = Math.cos((frame * orb.speed * 0.04) + orb.phase) * 20;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${orb.x}%`,
              top: `${orb.y}%`,
              width: orb.size,
              height: orb.size,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${orb.color} 0%, transparent 70%)`,
              transform: `translate(${drift}px, ${driftY}px)`,
              pointerEvents: "none",
            }}
          />
        );
      })}

      {/* Floating particles */}
      {PARTICLES.map((p, i) => {
        const driftX = Math.sin(frame * 0.015 * p.speed + p.phase) * 20;
        const driftY = Math.cos(frame * 0.012 * p.speed + p.phase) * 15;
        const twinkle = 0.3 + Math.sin(frame * 0.08 + p.phase) * 0.3;
        return (
          <div
            key={`p-${i}`}
            style={{
              position: "absolute",
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              borderRadius: "50%",
              backgroundColor: "rgba(34,197,94,0.5)",
              boxShadow: `0 0 ${p.size * 3}px rgba(34,197,94,0.2)`,
              opacity: particleOpacity * twinkle,
              transform: `translate(${driftX}px, ${driftY}px)`,
              pointerEvents: "none",
            }}
          />
        );
      })}

      {/* Subtle horizontal accent lines */}
      <div
        style={{
          position: "absolute",
          top: "38%",
          left: "10%",
          width: `${line1W * 25}%`,
          height: 1,
          background:
            "linear-gradient(90deg, transparent, rgba(34,197,94,0.15), transparent)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "35%",
          right: "10%",
          width: `${line2W * 20}%`,
          height: 1,
          background:
            "linear-gradient(90deg, transparent, rgba(34,197,94,0.12), transparent)",
        }}
      />

      {/* Corner bracket accents */}
      {[
        { top: 60, left: 60, borderTop: "2px solid", borderLeft: "2px solid" },
        { top: 60, right: 60, borderTop: "2px solid", borderRight: "2px solid" },
        { bottom: 60, left: 60, borderBottom: "2px solid", borderLeft: "2px solid" },
        { bottom: 60, right: 60, borderBottom: "2px solid", borderRight: "2px solid" },
      ].map((pos, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            ...pos,
            width: 40,
            height: 40,
            borderColor: "rgba(34,197,94,0.3)",
            opacity: bracketOpacity,
            transform: `scale(${bracketScale})`,
          } as React.CSSProperties}
        />
      ))}

      {/* Main content */}
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
            width: 380,
            transform: `scale(${logoScale})`,
            opacity: logoOpacity,
            filter: "drop-shadow(0 4px 30px rgba(34,197,94,0.15))",
          }}
        />

        {/* Tagline */}
        <div
          style={{
            opacity: tagOpacity,
            transform: `translateY(${tagY}px)`,
            fontSize: 34,
            fontWeight: 500,
            color: "rgba(255, 255, 255, 0.9)",
            fontFamily: interFont,
            letterSpacing: "0.04em",
            textAlign: "center",
            marginTop: 32,
          }}
        >
          Point of Sale for Cannabis Retail
        </div>

        {/* Separator */}
        <div
          style={{
            width: sepW,
            height: 2,
            background:
              "linear-gradient(90deg, transparent, rgba(34,197,94,0.5), transparent)",
            marginTop: 24,
            marginBottom: 24,
          }}
        />

        {/* Subtitle */}
        <div
          style={{
            opacity: subOpacity,
            transform: `translateY(${subY}px)`,
            fontSize: 20,
            fontWeight: 400,
            color: "rgba(255, 255, 255, 0.5)",
            fontFamily: interFont,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            textAlign: "center",
          }}
        >
          Product Demo
        </div>
      </AbsoluteFill>

      {/* Subtle vignette */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 100%)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
