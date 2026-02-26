import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily: interFont } = loadFont("normal", {
  weights: ["600"],
  subsets: ["latin"],
});

/**
 * Animated callout annotation that pops in from the side,
 * with a connecting line to a point on screen.
 */

export type CalloutData = {
  /** Frame when this callout appears */
  startFrame: number;
  /** How many frames to show */
  durationFrames: number;
  /** Label text */
  label: string;
  /** Side of the screen: left or right */
  side: "left" | "right";
  /** Vertical position (0-100%) */
  y: number;
  /** Optional icon/emoji */
  icon?: string;
};

export const FeatureCallout: React.FC<CalloutData> = ({
  startFrame,
  durationFrames,
  label,
  side,
  y,
  icon,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const localFrame = frame - startFrame;
  if (localFrame < 0 || localFrame > durationFrames) return null;

  // ── Enter animation ──────────────────────────────────────────────
  const enterProgress = spring({
    frame: localFrame,
    fps,
    config: { damping: 14, stiffness: 120 },
  });

  // ── Exit animation ───────────────────────────────────────────────
  const exitStart = durationFrames - 15;
  const exitOpacity = interpolate(
    localFrame,
    [exitStart, durationFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const slideX = side === "left"
    ? interpolate(enterProgress, [0, 1], [-200, 0])
    : interpolate(enterProgress, [0, 1], [200, 0]);

  const lineWidth = interpolate(enterProgress, [0, 1], [0, 60]);
  const opacity = enterProgress * exitOpacity;

  const isLeft = side === "left";

  return (
    <div
      style={{
        position: "absolute",
        [isLeft ? "left" : "right"]: 40,
        top: `${y}%`,
        display: "flex",
        alignItems: "center",
        flexDirection: isLeft ? "row" : "row-reverse",
        gap: 0,
        opacity,
        transform: `translateX(${slideX}px)`,
        pointerEvents: "none",
      }}
    >
      {/* Pill label */}
      <div
        style={{
          background: "rgba(34, 197, 94, 0.15)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(34, 197, 94, 0.3)",
          borderRadius: 10,
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          whiteSpace: "nowrap",
        }}
      >
        {icon && (
          <span style={{ fontSize: 22 }}>{icon}</span>
        )}
        <span
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: "#fff",
            fontFamily: interFont,
            letterSpacing: "0.02em",
          }}
        >
          {label}
        </span>
      </div>

      {/* Connecting line */}
      <div
        style={{
          width: lineWidth,
          height: 2,
          background: "linear-gradient(90deg, rgba(34,197,94,0.5), rgba(34,197,94,0.1))",
          ...(isLeft ? {} : { transform: "scaleX(-1)" }),
        }}
      />

      {/* Dot at end of line */}
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: "rgba(34,197,94,0.6)",
          boxShadow: "0 0 12px rgba(34,197,94,0.4)",
          transform: `scale(${enterProgress})`,
        }}
      />
    </div>
  );
};
