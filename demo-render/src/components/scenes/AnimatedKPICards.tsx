import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

export type KPIData = {
  label: string;
  value: number;
  prefix?: string; // "$", etc.
  suffix?: string; // "%", "units", etc.
  change?: number; // +12.5 means up 12.5%, -3.2 means down 3.2%
  icon?: string; // emoji or text icon
};

/**
 * Animated KPI dashboard cards with staggered count-up animation.
 * Use for native rendering of dashboard overview scenes.
 */
export const AnimatedKPICards: React.FC<{
  cards: KPIData[];
  title?: string;
}> = ({ cards, title = "Dashboard" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Title animation
  const titleSpring = spring({
    frame: frame - 5,
    fps,
    config: { damping: 16, stiffness: 100 },
  });
  const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1]);
  const titleY = interpolate(titleSpring, [0, 1], [-30, 0]);

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(160deg, #0a0a0a 0%, #0d1a12 40%, #0a0a0a 100%)",
        padding: "80px 100px",
        flexDirection: "column",
      }}
    >
      {/* Title */}
      <div
        style={{
          fontSize: 42,
          fontWeight: 700,
          color: "white",
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          marginBottom: 60,
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div
          style={{
            width: 4,
            height: 36,
            backgroundColor: "#22c55e",
            borderRadius: 2,
          }}
        />
        {title}
      </div>

      {/* Cards grid */}
      <div
        style={{
          display: "flex",
          gap: 28,
          flexWrap: "wrap",
        }}
      >
        {cards.map((card, i) => {
          const delay = 15 + i * 8;
          const cardSpring = spring({
            frame: frame - delay,
            fps,
            config: { damping: 14, stiffness: 90 },
          });

          const cardScale = interpolate(cardSpring, [0, 1], [0.85, 1]);
          const cardOpacity = interpolate(cardSpring, [0, 1], [0, 1]);

          // Count-up animation
          const countProgress = interpolate(
            frame,
            [delay + 10, delay + 50],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          // Eased count
          const eased = countProgress * countProgress * (3 - 2 * countProgress);
          const displayValue = Math.round(card.value * eased);

          // Change indicator spring
          const changeSpring = spring({
            frame: frame - delay - 35,
            fps,
            config: { damping: 12, stiffness: 120 },
          });

          const isPositive = (card.change ?? 0) >= 0;

          return (
            <div
              key={i}
              style={{
                flex: "1 1 calc(25% - 28px)",
                minWidth: 280,
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: 16,
                padding: "32px 28px",
                transform: `scale(${cardScale})`,
                opacity: cardOpacity,
                backdropFilter: "blur(8px)",
              }}
            >
              {/* Icon + Label */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                {card.icon && (
                  <span style={{ fontSize: 24 }}>{card.icon}</span>
                )}
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 500,
                    color: "rgba(255, 255, 255, 0.5)",
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {card.label}
                </span>
              </div>

              {/* Value */}
              <div
                style={{
                  fontSize: 44,
                  fontWeight: 800,
                  color: "white",
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  lineHeight: 1,
                  marginBottom: 12,
                }}
              >
                {card.prefix || ""}
                {displayValue.toLocaleString()}
                {card.suffix ? ` ${card.suffix}` : ""}
              </div>

              {/* Change indicator */}
              {card.change !== undefined && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    opacity: changeSpring,
                    transform: `translateY(${interpolate(changeSpring, [0, 1], [10, 0])}px)`,
                  }}
                >
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: isPositive ? "#22c55e" : "#ef4444",
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    }}
                  >
                    {isPositive ? "+" : ""}{card.change}%
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      color: "rgba(255, 255, 255, 0.35)",
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    }}
                  >
                    vs last period
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Subtle vignette */}
      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.3) 100%)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
