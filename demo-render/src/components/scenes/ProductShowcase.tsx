import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

export type ProductData = {
  name: string;
  category: string;
  price: number;
  thc?: string;
  cbd?: string;
  strain?: string;
  weight?: string;
  image?: string; // URL or placeholder
};

/**
 * Animated product showcase grid with spotlight/zoom on featured items.
 * Use for native rendering of product catalog scenes.
 */
export const ProductShowcase: React.FC<{
  products: ProductData[];
  title?: string;
  spotlightIndex?: number; // Which product to zoom-spotlight
}> = ({ products, title = "Products", spotlightIndex = 0 }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Title animation
  const titleSpring = spring({
    frame: frame - 5,
    fps,
    config: { damping: 16, stiffness: 100 },
  });

  // Spotlight timing: first half grid, second half spotlight
  const spotlightStart = Math.round(durationInFrames * 0.4);
  const isSpotlight = frame > spotlightStart;
  const spotlightProgress = interpolate(
    frame,
    [spotlightStart, spotlightStart + 20],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(160deg, #0a0a0a 0%, #0d1a12 40%, #0a0a0a 100%)",
        padding: "60px 80px",
        flexDirection: "column",
      }}
    >
      {/* Title */}
      <div
        style={{
          fontSize: 36,
          fontWeight: 700,
          color: "white",
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          marginBottom: 40,
          opacity: interpolate(titleSpring, [0, 1], [0, 1]),
          transform: `translateY(${interpolate(titleSpring, [0, 1], [-20, 0])}px)`,
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div style={{ width: 4, height: 30, backgroundColor: "#22c55e", borderRadius: 2 }} />
        {title}
      </div>

      {/* Product grid */}
      <div
        style={{
          display: "flex",
          gap: 20,
          flexWrap: "wrap",
          flex: 1,
        }}
      >
        {products.slice(0, 8).map((product, i) => {
          const delay = 12 + i * 6;
          const cardSpring = spring({
            frame: frame - delay,
            fps,
            config: { damping: 14, stiffness: 90 },
          });

          const isSpotlighted = isSpotlight && i === spotlightIndex;

          // Spotlight zoom
          const zoomScale = isSpotlighted
            ? interpolate(spotlightProgress, [0, 1], [1, 1.15])
            : isSpotlight
              ? interpolate(spotlightProgress, [0, 1], [1, 0.92])
              : 1;

          const cardOpacity = isSpotlight && i !== spotlightIndex
            ? interpolate(spotlightProgress, [0, 1], [1, 0.4])
            : interpolate(cardSpring, [0, 1], [0, 1]);

          const borderColor = isSpotlighted
            ? `rgba(34, 197, 94, ${interpolate(spotlightProgress, [0, 1], [0.08, 0.4])})`
            : "rgba(255, 255, 255, 0.06)";

          // Strain type color
          const strainColor =
            product.strain === "Sativa" ? "#22c55e" :
            product.strain === "Indica" ? "#a855f7" :
            product.strain === "Hybrid" ? "#3b82f6" : "rgba(255,255,255,0.5)";

          return (
            <div
              key={i}
              style={{
                flex: "1 1 calc(25% - 20px)",
                minWidth: 240,
                maxWidth: 380,
                background: "rgba(255, 255, 255, 0.03)",
                border: `1px solid ${borderColor}`,
                borderRadius: 14,
                padding: "24px 20px",
                transform: `scale(${interpolate(cardSpring, [0, 1], [0.9, zoomScale])})`,
                opacity: cardOpacity,
                backdropFilter: "blur(6px)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                transition: "border-color 0.3s",
              }}
            >
              {/* Product image placeholder */}
              <div
                style={{
                  width: "100%",
                  height: 120,
                  borderRadius: 10,
                  background: "linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,197,94,0.02))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 36,
                }}
              >
                {product.strain === "Sativa" ? "🌿" : product.strain === "Indica" ? "🌙" : "🍃"}
              </div>

              {/* Category */}
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.4)",
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                {product.category}
              </span>

              {/* Name */}
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: "white",
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  lineHeight: 1.2,
                }}
              >
                {product.name}
              </div>

              {/* THC/CBD + Strain row */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {product.strain && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: strainColor,
                      background: `${strainColor}15`,
                      padding: "3px 8px",
                      borderRadius: 6,
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    }}
                  >
                    {product.strain}
                  </span>
                )}
                {product.thc && (
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontFamily: "monospace" }}>
                    THC {product.thc}
                  </span>
                )}
                {product.weight && (
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontFamily: "monospace" }}>
                    {product.weight}
                  </span>
                )}
              </div>

              {/* Price */}
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  color: "#22c55e",
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  marginTop: "auto",
                }}
              >
                ${product.price.toFixed(2)}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
