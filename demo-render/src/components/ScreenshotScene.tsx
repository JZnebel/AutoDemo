import React from "react";
import {
  AbsoluteFill,
  Img,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  staticFile,
} from "remotion";
import { AnimatedCursor, type AnimatedCursorProps } from "./AnimatedCursor";
import { TypingAnimation } from "./TypingAnimation";

/**
 * A single scene in the ScoutReplay composition.
 *
 * Renders a screenshot as background with:
 * - Crossfade transition from previous screenshot
 * - Animated cursor movement to interaction targets
 * - Click pulse animations
 * - Typing overlays for fill actions
 * - Spring-based zoom into interaction areas
 * - Lower third label
 */

export type SceneAction = {
  type: "click" | "fill" | "navigate" | "press-key";
  /** Bounding box of the target element (viewport pixels) */
  bounds?: { x: number; y: number; w: number; h: number };
  /** Accessible label of the target element */
  label?: string;
  /** Value typed for fill actions */
  fillValue?: string;
  /** Key pressed for press-key actions */
  key?: string;
  /** Frames into this scene when the action starts */
  delayFrames: number;
};

export type ScreenshotSceneProps = {
  /** Path to the screenshot (relative to public/) */
  screenshotBefore: string;
  /** Optional screenshot after the action */
  screenshotAfter?: string;
  /** Frame within the scene when the "after" screenshot crossfades in */
  afterCrossfadeFrame?: number;
  /** Actions to animate in this scene */
  actions: SceneAction[];
  /** Total duration of this scene in frames */
  durationFrames: number;
  /** Lower third label text */
  lowerThird?: string;
  /** Whether to apply zoom to the first action's area */
  autoZoom?: boolean;
};

export const ScreenshotScene: React.FC<ScreenshotSceneProps> = ({
  screenshotBefore,
  screenshotAfter,
  afterCrossfadeFrame,
  actions,
  durationFrames,
  lowerThird,
  autoZoom = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ── Crossfade between before/after screenshots ──────────────────────
  const crossfadeStart = afterCrossfadeFrame ?? Math.floor(durationFrames * 0.6);
  const afterOpacity = screenshotAfter
    ? interpolate(frame, [crossfadeStart, crossfadeStart + 15], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  // ── Auto-zoom into first action with bounds ─────────────────────────
  let zoomTransform = "";
  if (autoZoom) {
    const zoomTarget = actions.find((a) => a.bounds && a.type === "click");
    if (zoomTarget?.bounds) {
      const cx = zoomTarget.bounds.x + zoomTarget.bounds.w / 2;
      const cy = zoomTarget.bounds.y + zoomTarget.bounds.h / 2;

      // Zoom in → hold → zoom out
      const zoomInStart = Math.max(0, zoomTarget.delayFrames - 10);
      const zoomInEnd = zoomTarget.delayFrames + 5;
      const zoomOutStart = zoomTarget.delayFrames + 45;
      const zoomOutEnd = zoomTarget.delayFrames + 60;

      const zoomIn = interpolate(
        frame,
        [zoomInStart, zoomInEnd],
        [1, 1.25],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      );
      const zoomOut = interpolate(
        frame,
        [zoomOutStart, zoomOutEnd],
        [1.25, 1],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      );

      const scale = frame < zoomOutStart ? zoomIn : zoomOut;

      // Translate to keep the focus point centered during zoom
      const originX = (cx / 1920) * 100;
      const originY = (cy / 1080) * 100;
      zoomTransform = `scale(${scale})`;

      // Apply as transform-origin on the container
      return (
        <AbsoluteFill>
          <div
            style={{
              width: "100%",
              height: "100%",
              transform: zoomTransform,
              transformOrigin: `${originX}% ${originY}%`,
            }}
          >
            <ScreenshotLayer
              src={screenshotBefore}
              opacity={1}
            />
            {screenshotAfter && (
              <ScreenshotLayer
                src={screenshotAfter}
                opacity={afterOpacity}
              />
            )}
          </div>

          {/* Cursor + interactions render on top (not zoomed) */}
          <CursorAndActions actions={actions} fps={fps} frame={frame} />

          {/* Lower third */}
          {lowerThird && (
            <SceneLowerThird text={lowerThird} frame={frame} fps={fps} />
          )}
        </AbsoluteFill>
      );
    }
  }

  // ── No zoom path ────────────────────────────────────────────────────
  return (
    <AbsoluteFill>
      <ScreenshotLayer src={screenshotBefore} opacity={1} />
      {screenshotAfter && (
        <ScreenshotLayer src={screenshotAfter} opacity={afterOpacity} />
      )}
      <CursorAndActions actions={actions} fps={fps} frame={frame} />
      {lowerThird && (
        <SceneLowerThird text={lowerThird} frame={frame} fps={fps} />
      )}
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════

const ScreenshotLayer: React.FC<{ src: string; opacity: number }> = ({
  src,
  opacity,
}) => (
  <AbsoluteFill style={{ opacity }}>
    <Img
      src={staticFile(src)}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  </AbsoluteFill>
);

/** Renders cursor movement + click pulses + typing overlays from actions. */
const CursorAndActions: React.FC<{
  actions: SceneAction[];
  fps: number;
  frame: number;
}> = ({ actions, fps, frame }) => {
  // Build cursor keyframes from actions
  const cursorKeyframes = actions
    .filter((a) => a.bounds)
    .map((a) => ({
      frame: a.delayFrames,
      x: a.bounds!.x + a.bounds!.w / 2,
      y: a.bounds!.y + a.bounds!.h / 2,
      click: a.type === "click",
    }));

  // Build typing overlays
  const typingActions = actions.filter(
    (a) => a.type === "fill" && a.fillValue && a.bounds,
  );

  return (
    <>
      {cursorKeyframes.length > 0 && (
        <AnimatedCursor keyframes={cursorKeyframes} />
      )}

      {typingActions.map((a, i) => (
        <TypingAnimation
          key={i}
          text={a.fillValue!}
          startFrame={a.delayFrames + 8}
          x={a.bounds!.x}
          y={a.bounds!.y + a.bounds!.h + 8}
          width={Math.max(200, a.bounds!.w)}
          label={a.label}
        />
      ))}
    </>
  );
};

/** Scene-level lower third with slide-in animation. */
const SceneLowerThird: React.FC<{
  text: string;
  frame: number;
  fps: number;
}> = ({ text, frame, fps }) => {
  const slideIn = spring({
    frame: Math.max(0, frame - 15),
    fps,
    config: { damping: 20, stiffness: 100 },
  });

  const translateX = interpolate(slideIn, [0, 1], [-300, 0]);
  const opacity = interpolate(slideIn, [0, 0.3], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        left: 40,
        bottom: 120,
        display: "flex",
        alignItems: "center",
        gap: 12,
        transform: `translateX(${translateX}px)`,
        opacity,
      }}
    >
      <div
        style={{
          width: 4,
          height: 32,
          backgroundColor: "#22c55e",
          borderRadius: 2,
        }}
      />
      <div
        style={{
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(12px)",
          padding: "8px 20px",
          borderRadius: 8,
          fontSize: 22,
          fontWeight: 600,
          color: "#e5e7eb",
          fontFamily: "Inter, system-ui, sans-serif",
          letterSpacing: "0.3px",
        }}
      >
        {text}
      </div>
    </div>
  );
};
