import React from "react";
import {
  OffthreadVideo,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  staticFile,
} from "remotion";

export const AvatarPip: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Slide in from right with spring after 1 second
  const slideIn = spring({
    frame: frame - 30,
    fps,
    config: { damping: 18, stiffness: 80 },
  });
  const translateX = interpolate(slideIn, [0, 1], [400, 0]);

  // Fade out near the end of the main content
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 30, durationInFrames - 10],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Subtle breathing scale for liveness
  const breathe = 1 + Math.sin(frame * 0.03) * 0.005;

  return (
    <div
      style={{
        position: "absolute",
        right: 38,
        bottom: 200,
        width: 280,
        height: 280,
        borderRadius: "50%",
        overflow: "hidden",
        boxShadow: "0 10px 40px rgba(0, 0, 0, 0.5), 0 0 0 3px rgba(34,197,94,0.3)",
        border: "3px solid rgba(255, 255, 255, 0.15)",
        background: "rgba(0, 0, 0, 0.3)",
        transform: `translateX(${translateX}px) scale(${breathe})`,
        opacity: fadeOut,
      }}
    >
      <OffthreadVideo
        src={staticFile("avatar.mp4")}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
        muted
      />
    </div>
  );
};
