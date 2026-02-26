import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";

export type ChapterCard = {
  title: string;
  subtitle?: string;
  startFrame: number;
  durationFrames: number;
};

export const TitleCard: React.FC<{ title: string; subtitle?: string }> = ({
  title,
  subtitle,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const opacity = interpolate(t, [0, 0.3, 2.5, 3.0], [0, 1, 1, 0], {
    extrapolateRight: "clamp",
  });

  const y = interpolate(t, [0, 0.35], [20, 0], {
    extrapolateRight: "clamp",
  });

  const scale = interpolate(t, [0, 0.35], [0.95, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{ justifyContent: "center", alignItems: "center" }}
    >
      <div
        style={{
          opacity,
          transform: `translateY(${y}px) scale(${scale})`,
          padding: "30px 44px",
          borderRadius: 20,
          background: "rgba(0, 0, 0, 0.6)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          maxWidth: 1200,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            color: "white",
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              marginTop: 12,
              fontSize: 28,
              fontWeight: 500,
              color: "rgba(255, 255, 255, 0.8)",
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
