import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily: interFont } = loadFont("normal", {
  weights: ["400", "600", "700", "800", "900"],
  subsets: ["latin"],
});

export type WordTiming = {
  text: string;
  startMs: number;
  endMs: number;
};

export type CaptionStyle = "minimal" | "bold" | "karaoke" | "pop";

type Page = {
  words: { text: string; startMs: number; endMs: number }[];
  startMs: number;
  endMs: number;
};

/**
 * Group words into display pages of ~5-7 words.
 * Break on sentence-ending punctuation or when hitting the word limit.
 */
function groupIntoPages(words: WordTiming[], maxWords = 6): Page[] {
  const pages: Page[] = [];
  let current: WordTiming[] = [];

  for (const word of words) {
    current.push(word);
    const isSentenceEnd = /[.!?]$/.test(word.text);
    if (current.length >= maxWords || isSentenceEnd) {
      pages.push({
        words: [...current],
        startMs: current[0].startMs,
        endMs: current[current.length - 1].endMs,
      });
      current = [];
    }
  }
  if (current.length > 0) {
    pages.push({
      words: current,
      startMs: current[0].startMs,
      endMs: current[current.length - 1].endMs,
    });
  }
  return pages;
}

// Style presets
const STYLES = {
  minimal: {
    bg: "rgba(0, 0, 0, 0.6)",
    blur: "blur(10px)",
    activeColor: "#22c55e",
    pastColor: "rgba(255, 255, 255, 0.95)",
    futureColor: "rgba(255, 255, 255, 0.45)",
    fontSize: 44,
    fontWeight: 600,
    activeFontWeight: 700,
    borderRadius: 16,
    padding: "16px 30px",
    activeScale: 1.0,
    popIn: false,
  },
  bold: {
    bg: "rgba(0, 0, 0, 0.85)",
    blur: "blur(12px)",
    activeColor: "#facc15", // yellow
    pastColor: "#ffffff",
    futureColor: "rgba(255, 255, 255, 0.35)",
    fontSize: 52,
    fontWeight: 800,
    activeFontWeight: 900,
    borderRadius: 12,
    padding: "20px 36px",
    activeScale: 1.08,
    popIn: false,
  },
  karaoke: {
    bg: "transparent",
    blur: "none",
    activeColor: "#3b82f6", // blue
    pastColor: "#ffffff",
    futureColor: "rgba(255, 255, 255, 0.3)",
    fontSize: 56,
    fontWeight: 900,
    activeFontWeight: 900,
    borderRadius: 0,
    padding: "0",
    activeScale: 1.15,
    popIn: false,
    textShadow: "0 2px 12px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.6)",
  },
  pop: {
    bg: "rgba(0, 0, 0, 0.75)",
    blur: "blur(10px)",
    activeColor: "#3b82f6", // blue
    pastColor: "rgba(255, 255, 255, 0.9)",
    futureColor: "rgba(255, 255, 255, 0.2)",
    fontSize: 48,
    fontWeight: 700,
    activeFontWeight: 800,
    borderRadius: 20,
    padding: "18px 32px",
    activeScale: 1.2,
    popIn: true,
  },
} as const;

export const WordHighlightCaptions: React.FC<{
  wordTimings: WordTiming[];
  style?: CaptionStyle;
  leftOffset?: number;
}> = ({ wordTimings, style: styleName = "pop", leftOffset = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentMs = (frame / fps) * 1000;

  const pages = useMemo(() => groupIntoPages(wordTimings, 6), [wordTimings]);
  const s = STYLES[styleName] || STYLES.pop;

  // Find active page
  const activePage = pages.find(
    (p) => currentMs >= p.startMs - 50 && currentMs <= p.endMs + 300
  );
  if (!activePage) return null;

  // Page enter animation — spring physics
  const pageEntryFrame = Math.round((activePage.startMs / 1000) * fps);
  const pageSpring = spring({
    frame: frame - pageEntryFrame + 5, // slight anticipation
    fps,
    config: { stiffness: 200, damping: 20, mass: 0.8 },
  });

  // Fade out at end of page
  const pageFadeOut = interpolate(
    currentMs,
    [activePage.endMs, activePage.endMs + 300],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const pageOpacity = Math.min(pageSpring, pageFadeOut);
  const slideY = interpolate(pageSpring, [0, 1], [20, 0]);

  return (
    <div
      style={{
        position: "absolute",
        left: leftOffset,
        right: 0,
        bottom: 60,
        display: "flex",
        justifyContent: "center",
        opacity: pageOpacity,
        transform: `translateY(${slideY}px)`,
      }}
    >
      <div
        style={{
          background: s.bg,
          backdropFilter: s.blur !== "none" ? s.blur : undefined,
          WebkitBackdropFilter: s.blur !== "none" ? s.blur : undefined,
          borderRadius: s.borderRadius,
          padding: s.padding,
          maxWidth: 1200,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "4px 10px",
        }}
      >
        {activePage.words.map((word, i) => {
          const isActive =
            currentMs >= word.startMs - 30 && currentMs <= word.endMs + 80;
          const isPast = currentMs > word.endMs + 80;
          const isFuture = !isActive && !isPast;

          // Per-word spring animation for "pop" style
          let wordScale = 1;
          let wordOpacity = 1;

          if (s.popIn && isActive) {
            const wordEntryFrame = Math.round((word.startMs / 1000) * fps);
            const wordSpring = spring({
              frame: frame - wordEntryFrame,
              fps,
              config: { stiffness: 300, damping: 12, mass: 0.5 },
            });
            wordScale = interpolate(wordSpring, [0, 1], [0.7, s.activeScale]);
            wordOpacity = wordSpring;
          } else if (isActive) {
            wordScale = s.activeScale;
          }

          // Future words fade in slightly
          if (isFuture && s.popIn) {
            wordOpacity = 0.4;
          }

          const color = isActive
            ? s.activeColor
            : isPast
              ? s.pastColor
              : s.futureColor;

          return (
            <span
              key={`${activePage.startMs}-${i}`}
              style={{
                fontSize: s.fontSize,
                fontWeight: isActive ? s.activeFontWeight : s.fontWeight,
                fontFamily: interFont,
                color,
                opacity: wordOpacity,
                transform: `scale(${wordScale})`,
                transformOrigin: "center bottom",
                display: "inline-block",
                lineHeight: 1.3,
                textShadow: (s as any).textShadow || "none",
                transition: isActive ? "none" : "color 0.15s ease, opacity 0.15s ease",
              }}
            >
              {word.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};
