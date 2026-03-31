import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";

export type LowerThirdData = {
  label: string;
  startFrame: number;
  durationFrames: number;
};

export const LowerThird: React.FC<{ label: string; leftOffset?: number; accentColor?: string }> = ({ label, leftOffset = 48, accentColor = "rgba(34,197,94,1)" }) => {
  const accent = useMemo(() => {
    const match = accentColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) return `rgb(${match[1]},${match[2]},${match[3]})`;
    return "#22c55e";
  }, [accentColor]);
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Slide in from left with spring
  const slideIn = spring({
    frame: frame - 5,
    fps,
    config: { damping: 18, stiffness: 100 },
  });
  const translateX = interpolate(slideIn, [0, 1], [-300, 0]);

  // Fade out at end
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 15, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Accent bar grows
  const barWidth = spring({
    frame: frame - 2,
    fps,
    config: { damping: 20, stiffness: 80 },
  });

  return (
    <div
      style={{
        position: "absolute",
        left: leftOffset,
        top: 40,
        opacity: fadeOut,
        transform: `translateX(${translateX}px)`,
        display: "flex",
        alignItems: "center",
        gap: 0,
      }}
    >
      {/* Green accent bar */}
      <div
        style={{
          width: 4,
          height: interpolate(barWidth, [0, 1], [0, 40]),
          backgroundColor: accent,
          borderRadius: 2,
          marginRight: 14,
        }}
      />

      {/* Label pill */}
      <div
        style={{
          background: "rgba(0, 0, 0, 0.7)",
          backdropFilter: "blur(8px)",
          borderRadius: 10,
          padding: "10px 22px",
          border: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <span
          style={{
            fontSize: 26,
            fontWeight: 600,
            color: "white",
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            letterSpacing: "0.01em",
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
};
