import React from "react";
import { AbsoluteFill, Audio, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { WordHighlightCaptions, WordTiming } from "./components/WordHighlightCaptions";

/**
 * A BrotherPOS training clip: the register (or back office) recording, the narration,
 * and captions in a strip of their own UNDER the picture.
 *
 * Not over it, as StartClip does: on a POS screen the buttons a line is about (Cash,
 * Complete Sale, the cart total) sit along the bottom edge, exactly where an overlaid
 * caption lands. A viewer copying the clip onto their own register has to see them.
 *
 * `zooms` (from bpos-training/edit.mjs) push in on the part of the screen a line works
 * with, so small table text reads on a phone. Frames; x/y/scale in recording pixels.
 */
export type Zoom = { from: number; to: number; x: number; y: number; scale: number };

export type TrainingClipProps = {
  videoSrc: string;
  audioSrc: string;
  wordTimings: WordTiming[];
  zooms?: Zoom[];
  accentColor: string;
  durationInFrames: number;
  width: number;          // of the recording
  height: number;
};

export const CAPTION_BAND = 120;

const EASE_SEC = 0.7;
const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

type View = { x: number; y: number; scale: number };
const mix = (a: View, b: View, k: number): View => ({
  x: a.x + (b.x - a.x) * k,
  y: a.y + (b.y - a.y) * k,
  scale: a.scale + (b.scale - a.scale) * k,
});

/** The view at `frame`: eases in from the full frame (or straight across from the zoom
 *  before, when they touch) and back out at the end. */
function viewAt(frame: number, zooms: Zoom[], full: View, fps: number): View {
  const ease = EASE_SEC * fps;
  const i = zooms.findIndex((z) => frame >= z.from && frame < z.to);
  if (i < 0) return full;
  const z = zooms[i];
  const prev = zooms[i - 1] && z.from - zooms[i - 1].to < fps * 0.4 ? zooms[i - 1] : null;
  const next = zooms[i + 1] && zooms[i + 1].from - z.to < fps * 0.4 ? zooms[i + 1] : null;
  const inK = smooth((frame - z.from) / ease);
  const outK = next ? 1 : smooth((z.to - frame) / ease);
  return mix(full, mix(prev ?? full, z, inK), outK);
}

export const TrainingClip: React.FC<TrainingClipProps> = ({ videoSrc, audioSrc, wordTimings, zooms = [], accentColor, width, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const v = viewAt(frame, zooms, { x: width / 2, y: height / 2, scale: 1 }, fps);
  const transform = `translate(${width / 2 - v.x * v.scale}px, ${height / 2 - v.y * v.scale}px) scale(${v.scale})`;
  return (
    <AbsoluteFill style={{ backgroundColor: "#0f1720" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width, height, overflow: "hidden" }}>
        <OffthreadVideo src={staticFile(videoSrc)} style={{ width, height, transformOrigin: "0 0", transform }} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: height, height: CAPTION_BAND }}>
        <WordHighlightCaptions wordTimings={wordTimings} style="minimal" accentColor={accentColor} bottom={22} />
      </div>
      <Audio src={staticFile(audioSrc)} />
    </AbsoluteFill>
  );
};

export const calculateTrainingClipMetadata = ({ props }: { props: TrainingClipProps }) => ({
  durationInFrames: props.durationInFrames,
  width: props.width,
  height: props.height + CAPTION_BAND,
});
