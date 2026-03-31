import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";

/**
 * Sleek animated progress bar at the bottom of the video.
 * Shows video progression with a glowing head and subtle gradient.
 */
export const ProgressBar: React.FC<{
  delayFrames?: number;
  accentColor?: string;
}> = ({ delayFrames = 0, accentColor = "rgba(${ac.r},${ac.g},${ac.b},1)" }) => {
  const ac = useMemo(() => {
    const m = accentColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return m ? { r: m[1], g: m[2], b: m[3] } : { r: "34", g: "197", b: "94" };
  }, [accentColor]);
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const localFrame = frame - delayFrames;
  if (localFrame < 0) return null;

  // Entrance fade
  const entrance = interpolate(localFrame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Progress 0-1
  const progress = interpolate(
    localFrame,
    [0, durationInFrames - delayFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const barWidth = 1720; // px (centered in 1920)

  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        left: 100,
        right: 100,
        height: 3,
        opacity: entrance * 0.7,
        pointerEvents: "none",
      }}
    >
      {/* Track */}
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 2,
          background: "rgba(255,255,255,0.08)",
          overflow: "hidden",
        }}
      >
        {/* Fill */}
        <div
          style={{
            width: `${progress * 100}%`,
            height: "100%",
            borderRadius: 2,
            background: `linear-gradient(90deg, rgba(${ac.r},${ac.g},${ac.b},0.3), rgba(${ac.r},${ac.g},${ac.b},0.8))`,
          }}
        />
      </div>

      {/* Glowing head */}
      <div
        style={{
          position: "absolute",
          top: -3,
          left: `${progress * 100}%`,
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: `rgba(${ac.r},${ac.g},${ac.b},0.9)`,
          boxShadow: `0 0 10px rgba(${ac.r},${ac.g},${ac.b},0.6), 0 0 20px rgba(${ac.r},${ac.g},${ac.b},0.3)`,
          transform: "translateX(-50%)",
        }}
      />
    </div>
  );
};
