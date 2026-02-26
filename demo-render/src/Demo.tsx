import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { IntroCard } from "./components/IntroCard";
import { OutroCard } from "./components/OutroCard";
import { TransitionClip } from "./components/TransitionClip";
import { ZoomableVideo, type ZoomRegion } from "./components/ZoomableVideo";
import { LowerThird, type LowerThirdData } from "./components/LowerThird";
import {
  WordHighlightCaptions,
  type WordTiming,
  type CaptionStyle,
} from "./components/WordHighlightCaptions";
import { AvatarPip } from "./components/AvatarPip";

export type DemoProps = {
  wordTimings: WordTiming[];
  lowerThirds: LowerThirdData[];
  zoomRegions: ZoomRegion[];
  showAvatar: boolean;
  audioVolume: number;
  introDurationFrames: number;
  transitionDurationFrames: number;
  videoDurationFrames: number;
  outroDurationFrames: number;
  captionStyle?: CaptionStyle;
};

export const Demo: React.FC<DemoProps> = ({
  wordTimings,
  lowerThirds,
  zoomRegions,
  showAvatar,
  audioVolume,
  introDurationFrames,
  transitionDurationFrames,
  videoDurationFrames,
  outroDurationFrames,
  captionStyle = "pop",
}) => {
  const transitionStart = introDurationFrames;
  const mainStart = transitionStart + (transitionDurationFrames || 0);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0d0d0d" }}>
      {/* ═══ INTRO — Sora 2 cinematic background ═══ */}
      <Sequence from={0} durationInFrames={introDurationFrames}>
        <IntroCard />
      </Sequence>

      {/* ═══ TRANSITION — POS reference clip ═══ */}
      {transitionDurationFrames > 0 && (
        <Sequence
          from={transitionStart}
          durationInFrames={transitionDurationFrames}
        >
          <TransitionClip />
        </Sequence>
      )}

      {/* ═══ MAIN CONTENT ═══ */}
      <Sequence from={mainStart} durationInFrames={videoDurationFrames}>
        {/* Screen recording with zoom effects (video has audio baked in) */}
        <ZoomableVideo zoomRegions={zoomRegions} />

        {/* Lower thirds — feature labels */}
        {lowerThirds.map((lt, i) => (
          <Sequence
            key={i}
            from={lt.startFrame}
            durationInFrames={lt.durationFrames}
          >
            <LowerThird label={lt.label} />
          </Sequence>
        ))}

        {/* Word-highlight captions */}
        {wordTimings.length > 0 && (
          <WordHighlightCaptions wordTimings={wordTimings} style={captionStyle} />
        )}

        {/* Avatar PIP — LivePortrait presenter */}
        {showAvatar && <AvatarPip />}
      </Sequence>

      {/* ═══ OUTRO — Ken Burns dispensary background ═══ */}
      <Sequence
        from={mainStart + videoDurationFrames}
        durationInFrames={outroDurationFrames}
      >
        <OutroCard />
      </Sequence>
    </AbsoluteFill>
  );
};
