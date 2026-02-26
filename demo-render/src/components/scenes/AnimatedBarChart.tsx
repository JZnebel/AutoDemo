import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

export type BarData = {
  label: string;
  value: number;
  color?: string;
};

/**
 * Animated horizontal bar chart with staggered growth.
 * Use for native rendering of report/analytics scenes.
 */
export const AnimatedBarChart: React.FC<{
  bars: BarData[];
  title?: string;
  subtitle?: string;
  maxValue?: number;
  showValues?: boolean;
  valuePrefix?: string;
}> = ({
  bars,
  title = "Report",
  subtitle,
  maxValue,
  showValues = true,
  valuePrefix = "$",
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const max = maxValue || Math.max(...bars.map((b) => b.value));

  // Title animation
  const titleSpring = spring({
    frame: frame - 5,
    fps,
    config: { damping: 16, stiffness: 100 },
  });

  // Fade out
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
      {/* Title */}
      <div
        style={{
          opacity: interpolate(titleSpring, [0, 1], [0, 1]),
          transform: `translateY(${interpolate(titleSpring, [0, 1], [-20, 0])}px)`,
          marginBottom: subtitle ? 8 : 50,
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
          {title}
        </div>
      </div>
      {subtitle && (
        <div
          style={{
            fontSize: 18,
            color: "rgba(255,255,255,0.4)",
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            marginBottom: 50,
            marginLeft: 18,
            opacity: interpolate(titleSpring, [0, 1], [0, 1]),
          }}
        >
          {subtitle}
        </div>
      )}

      {/* Bars */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 18,
          flex: 1,
          justifyContent: "center",
        }}
      >
        {bars.map((bar, i) => {
          const delay = 18 + i * 8;

          // Bar growth animation
          const barGrowth = spring({
            frame: frame - delay,
            fps,
            config: { damping: 18, stiffness: 60 },
          });

          // Label fade in
          const labelOpacity = interpolate(
            frame,
            [delay - 5, delay + 5],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );

          const barWidth = (bar.value / max) * 100;
          const barColor = bar.color || `hsl(${142 + i * 8}, 70%, ${50 - i * 3}%)`;

          // Count-up for value
          const countProgress = interpolate(
            frame,
            [delay + 5, delay + 35],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          const eased = countProgress * countProgress * (3 - 2 * countProgress);
          const displayValue = Math.round(bar.value * eased);

          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {/* Label */}
              <div
                style={{
                  width: 150,
                  fontSize: 16,
                  fontWeight: 500,
                  color: "rgba(255, 255, 255, 0.7)",
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  textAlign: "right",
                  opacity: labelOpacity,
                  flexShrink: 0,
                }}
              >
                {bar.label}
              </div>

              {/* Bar track */}
              <div
                style={{
                  flex: 1,
                  height: 36,
                  background: "rgba(255, 255, 255, 0.04)",
                  borderRadius: 8,
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                {/* Bar fill */}
                <div
                  style={{
                    height: "100%",
                    width: `${barWidth * barGrowth}%`,
                    background: `linear-gradient(90deg, ${barColor}, ${barColor}cc)`,
                    borderRadius: 8,
                    boxShadow: `0 0 20px ${barColor}33`,
                  }}
                />
              </div>

              {/* Value */}
              {showValues && (
                <div
                  style={{
                    width: 100,
                    fontSize: 18,
                    fontWeight: 700,
                    color: "white",
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    opacity: labelOpacity,
                    flexShrink: 0,
                  }}
                >
                  {valuePrefix}{displayValue.toLocaleString()}
                </div>
              )}
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
