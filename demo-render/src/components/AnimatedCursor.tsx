import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from "remotion";

/**
 * Animated cursor with spring-physics movement and click pulse.
 *
 * Renders an SVG arrow cursor that moves between positions using spring
 * interpolation, with a ring pulse animation on clicks. Used by
 * ScreenshotScene to overlay interactions on screenshot backgrounds.
 */

type CursorKeyframe = {
  frame: number;
  x: number;
  y: number;
  click?: boolean;
};

export type AnimatedCursorProps = {
  keyframes: CursorKeyframe[];
  /** Cursor size in pixels (default: 24) */
  size?: number;
  /** Cursor color (default: white with dark shadow) */
  color?: string;
  /** Click pulse color (default: rgba(34,197,94,0.6)) */
  pulseColor?: string;
};

export const AnimatedCursor: React.FC<AnimatedCursorProps> = ({
  keyframes,
  size = 24,
  color = "#ffffff",
  pulseColor = "rgba(34,197,94,0.6)",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (keyframes.length === 0) return null;

  // Find current position by interpolating between keyframes
  const { x, y, clicking } = getCursorPosition(frame, keyframes, fps);

  // Click pulse animation — spring-based ring that expands and fades
  const clickSpring = clicking
    ? spring({ frame: frame - clicking.frame, fps, config: { damping: 15, mass: 0.5 } })
    : 0;

  const pulseScale = interpolate(clickSpring, [0, 1], [0.3, 2.5]);
  const pulseOpacity = interpolate(clickSpring, [0, 0.5, 1], [0.8, 0.4, 0]);

  // Cursor visibility — fade in at start
  const opacity = interpolate(frame, [0, 8], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {/* Click pulse ring */}
      {clicking && (
        <div
          style={{
            position: "absolute",
            left: x - 20,
            top: y - 20,
            width: 40,
            height: 40,
            borderRadius: "50%",
            border: `3px solid ${pulseColor}`,
            transform: `scale(${pulseScale})`,
            opacity: pulseOpacity,
          }}
        />
      )}

      {/* SVG cursor arrow */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        style={{
          position: "absolute",
          left: x,
          top: y,
          opacity,
          filter: "drop-shadow(1px 2px 3px rgba(0,0,0,0.5))",
          transform: "translate(-2px, -1px)",
        }}
      >
        {/* Classic arrow cursor shape */}
        <path
          d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.85a.5.5 0 0 0-.85.36z"
          fill={color}
          stroke="#1a1a1a"
          strokeWidth="1.2"
        />
      </svg>
    </AbsoluteFill>
  );
};

/** Compute cursor position at a given frame using spring interpolation. */
function getCursorPosition(
  frame: number,
  keyframes: CursorKeyframe[],
  fps: number,
): { x: number; y: number; clicking: CursorKeyframe | null } {
  // Before first keyframe — sit at first position
  if (frame <= keyframes[0].frame) {
    return { x: keyframes[0].x, y: keyframes[0].y, clicking: null };
  }

  // After last keyframe — sit at last position
  const last = keyframes[keyframes.length - 1];
  if (frame >= last.frame) {
    // Check if clicking at the last keyframe (within 15 frames)
    const clicking = last.click && frame - last.frame < 15 ? last : null;
    return { x: last.x, y: last.y, clicking };
  }

  // Find the surrounding keyframes
  let prevIdx = 0;
  for (let i = 1; i < keyframes.length; i++) {
    if (keyframes[i].frame > frame) break;
    prevIdx = i;
  }

  const prev = keyframes[prevIdx];
  const next = keyframes[prevIdx + 1];

  if (!next) {
    return { x: prev.x, y: prev.y, clicking: null };
  }

  // Spring-based interpolation between keyframes
  const elapsed = frame - prev.frame;
  const springVal = spring({
    frame: elapsed,
    fps,
    config: { damping: 28, stiffness: 120, mass: 0.8 },
    durationInFrames: next.frame - prev.frame,
  });

  const x = interpolate(springVal, [0, 1], [prev.x, next.x]);
  const y = interpolate(springVal, [0, 1], [prev.y, next.y]);

  // Check if currently clicking (within 15 frames of a click keyframe)
  let clicking: CursorKeyframe | null = null;
  for (const kf of keyframes) {
    if (kf.click && Math.abs(frame - kf.frame) < 15) {
      clicking = kf;
      break;
    }
  }

  return { x, y, clicking };
}
