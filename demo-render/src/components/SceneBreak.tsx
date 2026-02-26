import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

/**
 * SceneBreak — brief visual transition overlay at section boundaries.
 *
 * Renders for ~20 frames and layers three effects:
 * 1. Horizontal green line sweep (left→right) with glow
 * 2. Brief dim/blink (black overlay fades up then back down)
 * 3. Subtle scale pulse via spring
 */
export const SceneBreak: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();

  // --- 1. Horizontal line sweep ---
  const lineProgress = interpolate(frame, [0, 18], [0, 1], {
    extrapolateRight: "clamp",
  });
  const lineX = lineProgress * width;
  const lineOpacity = interpolate(frame, [0, 3, 15, 20], [0, 1, 1, 0], {
    extrapolateRight: "clamp",
  });

  // --- 2. Brief dim/blink ---
  const dimOpacity = interpolate(frame, [0, 5, 8, 14, 20], [0, 0.15, 0.15, 0, 0], {
    extrapolateRight: "clamp",
  });

  // --- 3. Scale pulse ---
  const scale = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 120, mass: 0.4 },
  });
  const scaleValue = interpolate(scale, [0, 1], [1, 1.015]);

  return (
    <AbsoluteFill style={{ transform: `scale(${scaleValue})` }}>
      {/* Dim overlay */}
      <AbsoluteFill
        style={{
          backgroundColor: "#000",
          opacity: dimOpacity,
        }}
      />

      {/* Sweep line with glow */}
      <AbsoluteFill style={{ opacity: lineOpacity }}>
        <div
          style={{
            position: "absolute",
            top: 0,
            left: lineX - 3,
            width: 3,
            height: "100%",
            background: "#00e87b",
            boxShadow: "0 0 20px 8px rgba(0, 232, 123, 0.5), 0 0 60px 20px rgba(0, 232, 123, 0.2)",
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
