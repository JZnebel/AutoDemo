import React from "react";
import { AbsoluteFill, Audio, OffthreadVideo, staticFile } from "remotion";
import { WordHighlightCaptions, WordTiming } from "./components/WordHighlightCaptions";

/**
 * A BrotherPOS training clip: the register (or back office) recording, the narration,
 * and captions in a strip of their own UNDER the picture.
 *
 * Not over it, as StartClip does: on a POS screen the buttons a line is about (Cash,
 * Complete Sale, the cart total) sit along the bottom edge, exactly where an overlaid
 * caption lands. A viewer copying the clip onto their own register has to see them.
 */
export type TrainingClipProps = {
  videoSrc: string;
  audioSrc: string;
  wordTimings: WordTiming[];
  accentColor: string;
  durationInFrames: number;
  width: number;          // of the recording
  height: number;
};

export const CAPTION_BAND = 120;

export const TrainingClip: React.FC<TrainingClipProps> = ({ videoSrc, audioSrc, wordTimings, accentColor, width, height }) => (
  <AbsoluteFill style={{ backgroundColor: "#0f1720" }}>
    <div style={{ position: "absolute", left: 0, top: 0, width, height }}>
      <OffthreadVideo src={staticFile(videoSrc)} style={{ width, height }} />
    </div>
    <div style={{ position: "absolute", left: 0, right: 0, top: height, height: CAPTION_BAND }}>
      <WordHighlightCaptions wordTimings={wordTimings} style="minimal" accentColor={accentColor} bottom={22} />
    </div>
    <Audio src={staticFile(audioSrc)} />
  </AbsoluteFill>
);

export const calculateTrainingClipMetadata = ({ props }: { props: TrainingClipProps }) => ({
  durationInFrames: props.durationInFrames,
  width: props.width,
  height: props.height + CAPTION_BAND,
});
