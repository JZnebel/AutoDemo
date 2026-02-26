import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile } from "remotion";
import {
  TransitionSeries,
  linearTiming,
  springTiming,
} from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { LightLeak } from "@remotion/light-leaks";
import { IntroCard } from "./components/IntroCard";
import { OutroCard } from "./components/OutroCard";
import { DeviceMockup } from "./components/DeviceMockup";
import { FeatureCallout, type CalloutData } from "./components/FeatureCallout";
import { LowerThird, type LowerThirdData } from "./components/LowerThird";
import {
  WordHighlightCaptions,
  type WordTiming,
  type CaptionStyle,
} from "./components/WordHighlightCaptions";
import { AvatarPip } from "./components/AvatarPip";
import { AudioWaveform } from "./components/AudioWaveform";
import { ProgressBar } from "./components/ProgressBar";
import { Presenter, type MouthCue } from "./components/Presenter";
import { SceneBreak } from "./components/SceneBreak";
import type { ZoomRegion } from "./components/ZoomableVideo";

/**
 * MarketingDemo — Premium marketing video composition.
 *
 * Screen recording inside a floating device mockup with animated gradient
 * background, feature callout annotations, cinematic intro/outro,
 * light leak transitions, word-highlight captions, and smooth animations.
 */

export type MarketingDemoProps = {
  wordTimings: WordTiming[];
  lowerThirds: LowerThirdData[];
  zoomRegions: ZoomRegion[];
  callouts: CalloutData[];
  showAvatar: boolean;
  showPresenter: boolean;
  mouthCues: MouthCue[];
  audioVolume: number;
  introDurationFrames: number;
  transitionDurationFrames: number;
  videoDurationFrames: number;
  outroDurationFrames: number;
  captionStyle?: CaptionStyle;
};

const LIGHT_LEAK_FRAMES = 40;
const OUTRO_TRANSITION_FRAMES = 20;

export function calculateMarketingDemoDuration(
  props: MarketingDemoProps,
): number {
  // Light leak overlay doesn't shorten timeline, only the outro fade transition does
  return (
    (props.introDurationFrames || 240) +
    (props.transitionDurationFrames || 0) +
    (props.videoDurationFrames || 2100) +
    (props.outroDurationFrames || 150) -
    OUTRO_TRANSITION_FRAMES
  );
}

export const MarketingDemo: React.FC<MarketingDemoProps> = ({
  wordTimings,
  lowerThirds,
  zoomRegions,
  callouts = [],
  showAvatar,
  showPresenter = false,
  mouthCues = [],
  audioVolume = 1.3,
  introDurationFrames,
  transitionDurationFrames,
  videoDurationFrames,
  outroDurationFrames,
  captionStyle = "pop",
}) => {
  const mainContentDuration =
    (transitionDurationFrames || 0) + videoDurationFrames;

  return (
    <AbsoluteFill style={{ backgroundColor: "#050a08" }}>
      <TransitionSeries>
        {/* ═══ INTRO — motion graphics ═══ */}
        <TransitionSeries.Sequence durationInFrames={introDurationFrames}>
          <IntroCard />
        </TransitionSeries.Sequence>

        {/* Light leak flash transition: intro → content */}
        <TransitionSeries.Overlay durationInFrames={LIGHT_LEAK_FRAMES}>
          <LightLeak seed={3} hueShift={140} />
        </TransitionSeries.Overlay>

        {/* ═══ MAIN CONTENT — device mockup + overlays ═══ */}
        <TransitionSeries.Sequence durationInFrames={mainContentDuration}>
          {/* Screen recording in device mockup */}
          <DeviceMockup
            zoomRegions={zoomRegions}
            layout={showPresenter ? "right" : "center"}
          />

          {/* 2D presenter character with Rhubarb lip sync */}
          {showPresenter && (
            <Presenter side="left" mouthCues={mouthCues} />
          )}

          {/* Audio-reactive waveform behind the content */}
          <AudioWaveform variant="bars" samples={64} height={160} />

          {/* Lower thirds — feature labels */}
          {lowerThirds.map((lt, i) => (
            <Sequence
              key={`lt-${i}`}
              from={lt.startFrame}
              durationInFrames={lt.durationFrames}
            >
              <LowerThird label={lt.label} leftOffset={showPresenter ? 500 : 48} />
            </Sequence>
          ))}

          {/* Feature callout annotations */}
          {callouts.map((c, i) => (
            <FeatureCallout
              key={`callout-${i}`}
              startFrame={c.startFrame}
              durationFrames={c.durationFrames}
              label={c.label}
              side={c.side}
              y={c.y}
              icon={c.icon}
            />
          ))}

          {/* Word-highlight captions */}
          {wordTimings.length > 0 && (
            <WordHighlightCaptions
              wordTimings={wordTimings}
              style={captionStyle}
              leftOffset={showPresenter ? 420 : 0}
            />
          )}

          {/* Progress bar at the bottom */}
          <ProgressBar />

          {/* Avatar PIP */}
          {showAvatar && <AvatarPip />}
        </TransitionSeries.Sequence>

        {/* Fade to outro */}
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: OUTRO_TRANSITION_FRAMES })}
        />

        {/* ═══ OUTRO — CTA ═══ */}
        <TransitionSeries.Sequence durationInFrames={outroDurationFrames}>
          <OutroCard />
        </TransitionSeries.Sequence>
      </TransitionSeries>

      {/* Background music bed — quiet corporate track under narration */}
      <Audio
        src={staticFile("music-bed.mp3")}
        loop
        volume={(f) => {
          const total =
            introDurationFrames +
            (transitionDurationFrames || 0) +
            videoDurationFrames +
            outroDurationFrames;
          const fadeIn = interpolate(f, [0, 60], [0, 0.12], {
            extrapolateRight: "clamp",
          });
          const fadeOut = interpolate(f, [total - 90, total], [0.12, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return Math.min(fadeIn, fadeOut);
        }}
      />
    </AbsoluteFill>
  );
};
