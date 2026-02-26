import React from "react";
import { AbsoluteFill, OffthreadVideo, staticFile, useCurrentFrame, interpolate } from "remotion";

export type ZoomRegion = {
  startFrame: number;
  endFrame: number;
  focusX: number; // x coordinate in 1920x1080 space
  focusY: number; // y coordinate in 1920x1080 space
  scale: number; // e.g. 1.3 = 130% zoom
};

const TRANSITION_FRAMES = 18; // ~0.6s smooth zoom in/out

export const ZoomableVideo: React.FC<{ zoomRegions: ZoomRegion[] }> = ({
  zoomRegions,
}) => {
  const frame = useCurrentFrame();

  let scale = 1;
  let originX = 960;
  let originY = 540;

  for (const region of zoomRegions) {
    if (
      frame >= region.startFrame - TRANSITION_FRAMES &&
      frame <= region.endFrame + TRANSITION_FRAMES
    ) {
      // Calculate zoom factor (0 = no zoom, 1 = full zoom)
      let zoomFactor: number;

      if (frame < region.startFrame) {
        // Zooming in (before region starts)
        zoomFactor = interpolate(
          frame,
          [region.startFrame - TRANSITION_FRAMES, region.startFrame],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );
      } else if (frame > region.endFrame) {
        // Zooming out (after region ends)
        zoomFactor = interpolate(
          frame,
          [region.endFrame, region.endFrame + TRANSITION_FRAMES],
          [1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );
      } else {
        // Fully zoomed
        zoomFactor = 1;
      }

      // Apply easing curve for smoother motion
      const eased = zoomFactor * zoomFactor * (3 - 2 * zoomFactor); // smoothstep

      scale = 1 + (region.scale - 1) * eased;
      originX = region.focusX;
      originY = region.focusY;
      break; // Only one zoom at a time
    }
  }

  return (
    <AbsoluteFill
      style={{
        transformOrigin: `${originX}px ${originY}px`,
        transform: `scale(${scale})`,
      }}
    >
      <OffthreadVideo src={staticFile("screen.mp4")} />
    </AbsoluteFill>
  );
};
