import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import {
  TransitionSeries,
  linearTiming,
} from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { IntroCard } from "./components/IntroCard";
import { OutroCard } from "./components/OutroCard";
import {
  ScreenshotScene,
  type SceneAction,
} from "./components/ScreenshotScene";
import {
  WordHighlightCaptions,
  type WordTiming,
  type CaptionStyle,
} from "./components/WordHighlightCaptions";
import { AvatarPip } from "./components/AvatarPip";

/**
 * ScoutReplay — Screenshot-based video composition.
 *
 * Renders a complete demo video from scout data (screenshots + JSONL actions)
 * without needing a screen recording. Each scene shows a screenshot background
 * with animated cursor, zoom effects, and typing overlays.
 *
 * Uses TransitionSeries for smooth fade transitions between scenes.
 * Scene durations are driven by narration audio timing (not fixed).
 *
 * Timeline: [Intro] → fade → [Scene 1] → fade → [Scene 2] → ... → fade → [Outro]
 */

/** Duration of fade transition between scenes (in frames). */
const TRANSITION_FRAMES = 15;

export type ScoutScene = {
  /** Screenshot for the scene start state (path relative to public/) */
  screenshotBefore: string;
  /** Optional screenshot after the main action */
  screenshotAfter?: string;
  /** Actions to animate (cursor moves, clicks, typing) */
  actions: SceneAction[];
  /** Total duration of this scene in frames */
  durationFrames: number;
  /** Lower third label */
  lowerThird?: string;
  /** Whether to auto-zoom into the first click target */
  autoZoom?: boolean;
  /** Word timings local to this scene (startMs relative to scene start) */
  sceneWordTimings?: WordTiming[];
  /** Offset in ms from the start of the full audio where this scene's narration begins */
  audioOffsetMs?: number;
};

export type ScoutReplayProps = {
  scenes: ScoutScene[];
  wordTimings: WordTiming[];
  captionStyle: CaptionStyle;
  showAvatar: boolean;
  audioVolume: number;
  introDurationFrames: number;
  outroDurationFrames: number;
  /** Path to narration audio file (relative to public/) */
  audioSrc?: string;
};

/** Calculate total duration from props (used by Root.tsx calculateMetadata). */
export function calculateScoutReplayDuration(props: ScoutReplayProps): number {
  const scenesTotal = props.scenes.reduce(
    (sum, s) => sum + s.durationFrames,
    0,
  );
  // Account for transition overlaps: each transition "eats" TRANSITION_FRAMES
  // from the total. There are (numScenes - 1) transitions between scenes,
  // plus 1 transition intro→scene1, plus 1 transition lastScene→outro.
  const numTransitions = props.scenes.length + 1; // intro→s1, s1→s2, ..., sN→outro
  const transitionOverlap = numTransitions * TRANSITION_FRAMES;

  return (
    (props.introDurationFrames || 150) +
    scenesTotal +
    (props.outroDurationFrames || 150) -
    transitionOverlap
  );
}

export const ScoutReplay: React.FC<ScoutReplayProps> = ({
  scenes,
  wordTimings,
  captionStyle = "pop",
  showAvatar,
  audioVolume = 1.3,
  introDurationFrames,
  outroDurationFrames,
  audioSrc,
}) => {
  const totalDuration = calculateScoutReplayDuration({
    scenes,
    wordTimings,
    captionStyle,
    showAvatar,
    audioVolume,
    introDurationFrames,
    outroDurationFrames,
    audioSrc,
  });

  // Calculate content start (after intro, accounting for first transition overlap)
  const contentStartFrame = introDurationFrames - TRANSITION_FRAMES;
  const contentDuration = totalDuration - contentStartFrame;

  return (
    <AbsoluteFill style={{ backgroundColor: "#0d0d0d" }}>
      {/* ═══ TRANSITION SERIES: Intro → Scenes → Outro ═══ */}
      <TransitionSeries>
        {/* Intro */}
        <TransitionSeries.Sequence durationInFrames={introDurationFrames}>
          <IntroCard />
        </TransitionSeries.Sequence>

        {/* Scenes with fade transitions */}
        {scenes.map((scene, i) => (
          <React.Fragment key={i}>
            <TransitionSeries.Transition
              presentation={fade()}
              timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
            />
            <TransitionSeries.Sequence durationInFrames={scene.durationFrames}>
              <ScreenshotScene
                screenshotBefore={scene.screenshotBefore}
                screenshotAfter={scene.screenshotAfter}
                actions={scene.actions}
                durationFrames={scene.durationFrames}
                lowerThird={scene.lowerThird}
                autoZoom={scene.autoZoom ?? true}
              />
            </TransitionSeries.Sequence>
          </React.Fragment>
        ))}

        {/* Outro */}
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
        />
        <TransitionSeries.Sequence durationInFrames={outroDurationFrames}>
          <OutroCard />
        </TransitionSeries.Sequence>
      </TransitionSeries>

      {/* ═══ NARRATION AUDIO ═══ */}
      {audioSrc && (
        <Sequence from={contentStartFrame} durationInFrames={contentDuration}>
          <Audio src={staticFile(audioSrc)} volume={audioVolume} />
        </Sequence>
      )}

      {/* ═══ CAPTIONS ═══ */}
      {wordTimings.length > 0 && (
        <Sequence from={contentStartFrame} durationInFrames={contentDuration}>
          <WordHighlightCaptions
            wordTimings={wordTimings}
            style={captionStyle}
          />
        </Sequence>
      )}

      {/* ═══ AVATAR PIP ═══ */}
      {showAvatar && (
        <Sequence from={contentStartFrame} durationInFrames={contentDuration}>
          <AvatarPip />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};
