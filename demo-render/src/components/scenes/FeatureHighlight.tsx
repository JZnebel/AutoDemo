import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

export type Feature = {
  icon: string;
  title: string;
  description: string;
};

/**
 * Animated feature highlight scene with staggered reveal.
 * Use for showcasing settings panels, feature lists, or capability overviews.
 */
export const FeatureHighlight: React.FC<{
  features: Feature[];
  heading?: string;
  subheading?: string;
}> = ({ features, heading = "Features", subheading }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Heading animation
  const headSpring = spring({
    frame: frame - 5,
    fps,
    config: { damping: 16, stiffness: 100 },
  });

  // Decorative ring animation
  const ringRotation = interpolate(frame, [0, durationInFrames], [0, 360]);
  const ringScale = spring({
    frame: frame - 2,
    fps,
    config: { damping: 25, stiffness: 50 },
  });

  // Fade out at end
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 15, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(160deg, #0a0a0a 0%, #0d1a12 40%, #0a0a0a 100%)",
        padding: "80px 120px",
        flexDirection: "column",
        opacity: fadeOut,
      }}
    >
      {/* Decorative corner ring */}
      <div
        style={{
          position: "absolute",
          top: -80,
          right: -80,
          width: 300,
          height: 300,
          borderRadius: "50%",
          border: "1px solid rgba(34,197,94,0.08)",
          transform: `rotate(${ringRotation}deg) scale(${ringScale})`,
          pointerEvents: "none",
        }}
      />

      {/* Heading */}
      <div
        style={{
          opacity: interpolate(headSpring, [0, 1], [0, 1]),
          transform: `translateY(${interpolate(headSpring, [0, 1], [-20, 0])}px)`,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontSize: 42,
            fontWeight: 700,
            color: "white",
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div style={{ width: 4, height: 36, backgroundColor: "#22c55e", borderRadius: 2 }} />
          {heading}
        </div>
        {subheading && (
          <div
            style={{
              fontSize: 18,
              color: "rgba(255,255,255,0.45)",
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              marginTop: 10,
              marginLeft: 18,
            }}
          >
            {subheading}
          </div>
        )}
      </div>

      {/* Feature list */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 20,
          marginTop: 40,
        }}
      >
        {features.map((feature, i) => {
          const delay = 20 + i * 12;
          const itemSpring = spring({
            frame: frame - delay,
            fps,
            config: { damping: 14, stiffness: 80 },
          });

          const slideX = interpolate(itemSpring, [0, 1], [-60, 0]);
          const itemOpacity = interpolate(itemSpring, [0, 1], [0, 1]);

          // Green line grows from left
          const lineWidth = spring({
            frame: frame - delay - 3,
            fps,
            config: { damping: 20, stiffness: 60 },
          });

          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 24,
                opacity: itemOpacity,
                transform: `translateX(${slideX}px)`,
              }}
            >
              {/* Icon circle */}
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 14,
                  background: "rgba(34, 197, 94, 0.08)",
                  border: "1px solid rgba(34, 197, 94, 0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 28,
                  flexShrink: 0,
                }}
              >
                {feature.icon}
              </div>

              {/* Growing connector line */}
              <div
                style={{
                  width: interpolate(lineWidth, [0, 1], [0, 30]),
                  height: 2,
                  background: "linear-gradient(90deg, rgba(34,197,94,0.3), rgba(34,197,94,0.05))",
                  flexShrink: 0,
                }}
              />

              {/* Text */}
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 600,
                    color: "white",
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    marginBottom: 4,
                  }}
                >
                  {feature.title}
                </div>
                <div
                  style={{
                    fontSize: 16,
                    color: "rgba(255, 255, 255, 0.45)",
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    lineHeight: 1.4,
                  }}
                >
                  {feature.description}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Vignette */}
      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.3) 100%)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
