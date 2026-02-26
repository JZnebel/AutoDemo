import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  staticFile,
  interpolate,
} from "remotion";
import {
  useWindowedAudioData,
  visualizeAudio,
} from "@remotion/media-utils";

/**
 * Audio-reactive waveform/bar visualizer that sits behind the device mockup.
 * Reacts to the narration audio in real-time for a cinematic feel.
 */

export const AudioWaveform: React.FC<{
  /** "bars" = vertical bars, "ring" = circular ring */
  variant?: "bars" | "ring";
  /** Number of frequency buckets (power of 2) */
  samples?: number;
  /** Base color */
  color?: string;
  /** Overall height of the visualizer region */
  height?: number;
}> = ({
  variant = "bars",
  samples = 64,
  color = "rgba(34,197,94,0.4)",
  height = 200,
}) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();

  const { audioData, dataOffsetInSeconds } = useWindowedAudioData({
    src: staticFile("screen.mp4"),
    frame,
    fps,
    windowInSeconds: 30,
  });

  if (!audioData) return null;

  const frequencies = visualizeAudio({
    fps,
    frame,
    audioData,
    numberOfSamples: samples as 32 | 64 | 128 | 256 | 512 | 1024,
    optimizeFor: "speed",
    dataOffsetInSeconds,
  });

  // Low-frequency bass intensity for glow effects
  const bassSlice = frequencies.slice(0, 8);
  const bassIntensity =
    bassSlice.reduce((sum, v) => sum + v, 0) / bassSlice.length;

  if (variant === "ring") {
    return <RingVisualizer frequencies={frequencies} color={color} bassIntensity={bassIntensity} />;
  }

  // ── Bar variant ──────────────────────────────────────────────────
  const barCount = frequencies.length;
  const barWidth = Math.max(2, (width * 0.6) / barCount - 2);

  return (
    <div
      style={{
        position: "absolute",
        bottom: "12%",
        left: "20%",
        right: "20%",
        height,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        gap: 2,
        opacity: 0.5,
        filter: `blur(1px)`,
        pointerEvents: "none",
      }}
    >
      {frequencies.map((v, i) => {
        // Mirror effect: bars grow from center
        const distFromCenter = Math.abs(i - barCount / 2) / (barCount / 2);
        const scaledHeight = v * height * (1 - distFromCenter * 0.3);

        return (
          <div
            key={i}
            style={{
              width: barWidth,
              height: Math.max(2, scaledHeight),
              borderRadius: barWidth / 2,
              background: `linear-gradient(to top, ${color}, rgba(34,197,94,${0.1 + v * 0.5}))`,
              boxShadow: v > 0.3
                ? `0 0 ${v * 12}px rgba(34,197,94,${v * 0.3})`
                : "none",
            }}
          />
        );
      })}

      {/* Bass-reactive glow */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: "25%",
          right: "25%",
          height: 60,
          background: `radial-gradient(ellipse at center bottom, rgba(34,197,94,${bassIntensity * 0.2}) 0%, transparent 70%)`,
          filter: "blur(20px)",
        }}
      />
    </div>
  );
};

/**
 * Circular ring visualizer — frequency bars arranged in a circle.
 */
const RingVisualizer: React.FC<{
  frequencies: number[];
  color: string;
  bassIntensity: number;
}> = ({ frequencies, color, bassIntensity }) => {
  const size = 400;
  const center = size / 2;
  const baseRadius = 120;
  const maxBarHeight = 80;

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        width: size,
        height: size,
        transform: "translate(-50%, -50%)",
        opacity: 0.3,
        pointerEvents: "none",
      }}
    >
      <svg width={size} height={size}>
        {frequencies.map((v, i) => {
          const angle = (i / frequencies.length) * Math.PI * 2 - Math.PI / 2;
          const barH = v * maxBarHeight;
          const x1 = center + Math.cos(angle) * baseRadius;
          const y1 = center + Math.sin(angle) * baseRadius;
          const x2 = center + Math.cos(angle) * (baseRadius + barH);
          const y2 = center + Math.sin(angle) * (baseRadius + barH);

          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={color}
              strokeWidth={3}
              strokeLinecap="round"
              opacity={0.4 + v * 0.6}
            />
          );
        })}
        {/* Inner glow circle */}
        <circle
          cx={center}
          cy={center}
          r={baseRadius * (1 + bassIntensity * 0.05)}
          fill="none"
          stroke="rgba(34,197,94,0.15)"
          strokeWidth={2}
        />
      </svg>
    </div>
  );
};
