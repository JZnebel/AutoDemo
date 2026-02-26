import React from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import type { ZoomRegion } from "./ZoomableVideo";

/**
 * Renders the screen recording inside a floating browser/laptop mockup
 * with an animated gradient background, subtle shadow, and reflection.
 */

export const DeviceMockup: React.FC<{
  zoomRegions: ZoomRegion[];
  /** "center" = full width centered, "right" = shifted right for presenter */
  layout?: "center" | "right";
}> = ({ zoomRegions, layout = "center" }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // ── Entrance animation ───────────────────────────────────────────
  const entranceProgress = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 60 },
  });
  const entranceY = interpolate(entranceProgress, [0, 1], [60, 0]);
  const entranceScale = interpolate(entranceProgress, [0, 1], [0.92, 1]);
  const entranceOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Subtle breathing float ───────────────────────────────────────
  const floatY = Math.sin(frame * 0.02) * 3;
  const floatRotate = Math.sin(frame * 0.015) * 0.15;

  // ── Zoom computation (same as ZoomableVideo) ─────────────────────
  let scale = 1;
  let originX = 50;
  let originY = 50;

  for (const region of zoomRegions) {
    const transFrames = 18;
    if (
      frame >= region.startFrame - transFrames &&
      frame <= region.endFrame + transFrames
    ) {
      let zoomFactor: number;
      if (frame < region.startFrame) {
        zoomFactor = interpolate(
          frame,
          [region.startFrame - transFrames, region.startFrame],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
      } else if (frame > region.endFrame) {
        zoomFactor = interpolate(
          frame,
          [region.endFrame, region.endFrame + transFrames],
          [1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
      } else {
        zoomFactor = 1;
      }
      const eased = zoomFactor * zoomFactor * (3 - 2 * zoomFactor);
      scale = 1 + (region.scale - 1) * eased;
      // Convert from 1920x1080 space to percentage
      originX = (region.focusX / 1920) * 100;
      originY = (region.focusY / 1080) * 100;
      break;
    }
  }

  // ── Background gradient ──────────────────────────────────────────
  const gradAngle = interpolate(frame, [0, durationInFrames], [135, 165], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      {/* Dispensary photo background */}
      <Img
        src={staticFile("presenter-bg.png")}
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "blur(4px) brightness(0.45)",
          transform: `scale(1.05) translate(${Math.sin(frame * 0.008) * 8}px, ${Math.cos(frame * 0.006) * 5}px)`,
        }}
      />

      {/* Dark gradient overlay for contrast */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(${gradAngle}deg, rgba(5,10,8,0.5) 0%, rgba(10,26,18,0.3) 50%, rgba(5,10,8,0.5) 100%)`,
        }}
      />

      {/* Grid pattern overlay */}
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(34,197,94,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(34,197,94,0.03) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          opacity: 0.3,
        }}
      />

      {/* Device container */}
      <div
        style={{
          position: "absolute",
          left: layout === "right" ? "58%" : "50%",
          top: layout === "right" ? "45%" : "50%",
          transform: `translate(-50%, -50%) translateY(${entranceY + floatY}px) scale(${entranceScale * (layout === "right" ? 0.92 : 1)}) rotate(${floatRotate}deg)`,
          opacity: entranceOpacity,
          width: 1520,
        }}
      >
        {/* Browser chrome */}
        <div
          style={{
            background: "linear-gradient(180deg, #2a2a2e 0%, #1e1e22 100%)",
            borderRadius: "12px 12px 0 0",
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {/* Traffic lights */}
          <div style={{ display: "flex", gap: 7 }}>
            {["#ff5f57", "#febc2e", "#28c840"].map((color) => (
              <div
                key={color}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  backgroundColor: color,
                }}
              />
            ))}
          </div>
          {/* URL bar */}
          <div
            style={{
              flex: 1,
              marginLeft: 12,
              background: "rgba(0,0,0,0.3)",
              borderRadius: 6,
              padding: "5px 14px",
              fontSize: 13,
              color: "rgba(255,255,255,0.5)",
              fontFamily: "SF Mono, Menlo, monospace",
            }}
          >
            brotherpos.ca/pos
          </div>
        </div>

        {/* Screen recording container */}
        <div
          style={{
            borderRadius: "0 0 12px 12px",
            overflow: "hidden",
            boxShadow:
              "0 25px 80px rgba(0,0,0,0.6), 0 8px 30px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)",
          }}
        >
          <div
            style={{
              transformOrigin: `${originX}% ${originY}%`,
              transform: `scale(${scale})`,
            }}
          >
            <OffthreadVideo
              src={staticFile("screen.mp4")}
              style={{
                width: "100%",
                display: "block",
              }}
            />
          </div>
        </div>

        {/* Reflection/glow under device */}
        <div
          style={{
            position: "absolute",
            bottom: -40,
            left: "10%",
            right: "10%",
            height: 80,
            background: "radial-gradient(ellipse at center, rgba(34,197,94,0.08) 0%, transparent 70%)",
            filter: "blur(20px)",
          }}
        />
      </div>

      {/* Subtle vignette */}
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
