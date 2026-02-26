import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
} from "remotion";

/**
 * Character-by-character text reveal overlay for fill/type actions.
 *
 * Renders a floating input-like box at the target position showing
 * text being "typed" one character at a time with a blinking caret.
 */

export type TypingAnimationProps = {
  text: string;
  /** Frame when typing starts */
  startFrame: number;
  /** Frames per character (default: 3 = ~10 chars/sec at 30fps) */
  framesPerChar?: number;
  /** Position of the input field */
  x: number;
  y: number;
  /** Width of the input overlay (default: 300) */
  width?: number;
  /** Label shown above the input (optional) */
  label?: string;
};

export const TypingAnimation: React.FC<TypingAnimationProps> = ({
  text,
  startFrame,
  framesPerChar = 3,
  x,
  y,
  width = 300,
  label,
}) => {
  const frame = useCurrentFrame();

  const elapsed = frame - startFrame;
  if (elapsed < 0) return null;

  // How many characters are visible
  const totalTypingFrames = text.length * framesPerChar;
  const charsVisible = Math.min(
    text.length,
    Math.floor(elapsed / framesPerChar),
  );
  const visibleText = text.substring(0, charsVisible);

  // Caret blink (toggle every 15 frames = 0.5s at 30fps)
  const showCaret =
    charsVisible < text.length || Math.floor(elapsed / 15) % 2 === 0;

  // Fade in the overlay
  const opacity = interpolate(elapsed, [0, 6], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Fade out after typing is done (hold for 30 frames then fade)
  const holdAfterTyping = 30;
  const fadeOutStart = totalTypingFrames + holdAfterTyping;
  const fadeOut = interpolate(
    elapsed,
    [fadeOutStart, fadeOutStart + 10],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const finalOpacity = Math.min(opacity, fadeOut);
  if (finalOpacity <= 0) return null;

  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity: finalOpacity }}>
      {/* Label above input */}
      {label && (
        <div
          style={{
            position: "absolute",
            left: x,
            top: y - 28,
            fontSize: 14,
            fontFamily: "Inter, system-ui, sans-serif",
            color: "rgba(255,255,255,0.7)",
            fontWeight: 500,
          }}
        >
          {label}
        </div>
      )}

      {/* Input-like overlay */}
      <div
        style={{
          position: "absolute",
          left: x,
          top: y,
          width,
          height: 40,
          background: "rgba(0,0,0,0.75)",
          border: "2px solid rgba(34,197,94,0.6)",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          backdropFilter: "blur(8px)",
        }}
      >
        <span
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 18,
            color: "#e5e7eb",
            letterSpacing: "0.5px",
          }}
        >
          {visibleText}
          {showCaret && (
            <span style={{ color: "rgba(34,197,94,0.9)" }}>|</span>
          )}
        </span>
      </div>
    </AbsoluteFill>
  );
};
