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
import { CustomIntro } from "./components/CustomIntro";
import { CustomOutro } from "./components/CustomOutro";
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
  introTagline?: string;
  introSubtitle?: string;
  outroHeading?: string;
  outroUrl?: string;
  outroCtaText?: string;
  accentColor?: string;
  introVideoSrc?: string;
  outroVideoSrc?: string;
  introLogoSrc?: string;
  /** URL shown in browser chrome bar (e.g. "rezweed.com") */
  displayUrl?: string;
};

const INTRO_TRANSITION_FRAMES = 20;
const OUTRO_TRANSITION_FRAMES = 20;

export function calculateMarketingDemoDuration(
  props: MarketingDemoProps,
): number {
  // Both intro and outro fade transitions shorten the timeline
  return (
    (props.introDurationFrames || 240) +
    (props.transitionDurationFrames || 0) +
    (props.videoDurationFrames || 2100) +
    (props.outroDurationFrames || 150) -
    INTRO_TRANSITION_FRAMES -
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
  introTagline,
  introSubtitle,
  outroHeading,
  outroUrl,
  outroCtaText,
  accentColor,
  introVideoSrc,
  outroVideoSrc,
  introLogoSrc,
  displayUrl,
}) => {
  const mainContentDuration =
    (transitionDurationFrames || 0) + videoDurationFrames;

  return (
    <AbsoluteFill style={{ backgroundColor: "#050a08" }}>
      <TransitionSeries>
        {/* ═══ INTRO — motion graphics ═══ */}
        <TransitionSeries.Sequence durationInFrames={introDurationFrames}>
          <CustomIntro tagline={introTagline} subtitle={introSubtitle} accentColor={accentColor} logoSrc={introLogoSrc} />
        </TransitionSeries.Sequence>

        {/* Fade transition: intro → content */}
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 20 })}
        />

        {/* ═══ MAIN CONTENT — device mockup + overlays ═══ */}
        <TransitionSeries.Sequence durationInFrames={mainContentDuration}>
          {/* Screen recording in device mockup */}
          <DeviceMockup
            zoomRegions={zoomRegions}
            layout={showPresenter ? "right" : "center"}
            accentColor={accentColor}
            displayUrl={displayUrl || outroUrl}
          />

          {/* 2D presenter character with Rhubarb lip sync */}
          {showPresenter && (
            <Presenter side="left" mouthCues={mouthCues} />
          )}

          {/* Audio-reactive waveform behind the content */}
          <AudioWaveform variant="bars" samples={64} height={160} accentColor={accentColor} />

          {/* Lower thirds — feature labels */}
          {lowerThirds.map((lt, i) => (
            <Sequence
              key={`lt-${i}`}
              from={lt.startFrame}
              durationInFrames={lt.durationFrames}
            >
              <LowerThird label={lt.label} leftOffset={showPresenter ? 500 : 48} accentColor={accentColor} />
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
              accentColor={accentColor}
            />
          ))}

          {/* Word-highlight captions */}
          {wordTimings.length > 0 && (
            <WordHighlightCaptions
              wordTimings={wordTimings}
              style={captionStyle}
              leftOffset={showPresenter ? 420 : 0}
              accentColor={accentColor}
            />
          )}

          {/* Progress bar at the bottom */}
          <ProgressBar accentColor={accentColor} />

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
          <CustomOutro heading={outroHeading} url={outroUrl} ctaText={outroCtaText} accentColor={accentColor} logoSrc={introLogoSrc} />
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
