import { interpolate } from "remotion";
import type { WordTiming } from "./components/WordHighlightCaptions";

/**
 * Music-bed volume that ducks under narration.
 *
 * Words closer than `gapMs` are merged into one speech span, so the music only
 * swells back up in real pauses (between segments, intro, outro) — not between
 * every word. Attack/release ramps keep the swell from pumping.
 *
 * Usage inside a composition:
 *   const musicVolume = useMemo(() => duckedMusicVolume({ wordTimings, speechStartFrame, totalFrames, fps }), [...]);
 *   <Audio src={staticFile("music-bed.mp3")} loop volume={musicVolume} />
 *
 * `speechStartFrame` is the composition frame where narration audio begins
 * (e.g. introDurationFrames minus the intro→content transition overlap).
 */
export function duckedMusicVolume({
  wordTimings,
  speechStartFrame,
  totalFrames,
  fps,
  baseVolume = 0.12,
  duckedVolume = 0.04,
  gapMs = 700,
  attackMs = 250,
  releaseMs = 600,
  fadeInFrames = 60,
  fadeOutFrames = 90,
}: {
  wordTimings: WordTiming[];
  speechStartFrame: number;
  totalFrames: number;
  fps: number;
  baseVolume?: number;
  duckedVolume?: number;
  gapMs?: number;
  attackMs?: number;
  releaseMs?: number;
  fadeInFrames?: number;
  fadeOutFrames?: number;
}): (frame: number) => number {
  // Merge words into speech spans
  const spans: { start: number; end: number }[] = [];
  for (const w of wordTimings) {
    const last = spans[spans.length - 1];
    if (last && w.startMs - last.end < gapMs) {
      last.end = Math.max(last.end, w.endMs);
    } else {
      spans.push({ start: w.startMs, end: w.endMs });
    }
  }

  return (frame: number) => {
    const tMs = ((frame - speechStartFrame) / fps) * 1000;

    // 0 = fully ducked, 1 = full music
    let lift = 1;
    for (const s of spans) {
      if (tMs >= s.start && tMs <= s.end) {
        lift = 0;
        break;
      }
      if (tMs < s.start) {
        lift = Math.min(lift, (s.start - tMs) / attackMs);
      } else {
        lift = Math.min(lift, (tMs - s.end) / releaseMs);
      }
    }
    lift = Math.max(0, Math.min(1, lift));
    const ducked = duckedVolume + (baseVolume - duckedVolume) * lift;

    const fadeIn = interpolate(frame, [0, fadeInFrames], [0, 1], {
      extrapolateRight: "clamp",
    });
    const fadeOut = interpolate(frame, [totalFrames - fadeOutFrames, totalFrames], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    return ducked * Math.min(fadeIn, fadeOut);
  };
}
