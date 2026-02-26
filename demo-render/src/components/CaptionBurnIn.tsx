import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";

export type Caption = {
  startInSeconds: number;
  endInSeconds: number;
  text: string;
};

export const CaptionBurnIn: React.FC<{ captions: Caption[] }> = ({
  captions,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const active = captions.find(
    (c) => t >= c.startInSeconds && t < c.endInSeconds
  );
  if (!active) return null;

  // Fade in over first 0.15s of each caption
  const fadeIn = interpolate(
    t,
    [active.startInSeconds, active.startInSeconds + 0.15],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Slight slide up on entry
  const slideY = interpolate(
    t,
    [active.startInSeconds, active.startInSeconds + 0.2],
    [8, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 70,
        display: "flex",
        justifyContent: "center",
        opacity: fadeIn,
        transform: `translateY(${slideY}px)`,
      }}
    >
      <div
        style={{
          background: "rgba(0, 0, 0, 0.65)",
          backdropFilter: "blur(8px)",
          borderRadius: 14,
          padding: "14px 28px",
          maxWidth: 1400,
        }}
      >
        <span
          style={{
            fontSize: 42,
            lineHeight: 1.2,
            fontWeight: 600,
            color: "white",
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            letterSpacing: "-0.01em",
          }}
        >
          {active.text}
        </span>
      </div>
    </div>
  );
};
