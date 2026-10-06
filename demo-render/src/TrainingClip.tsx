import React from "react";
import { AbsoluteFill, Audio, OffthreadVideo, Series, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { WordHighlightCaptions, WordTiming } from "./components/WordHighlightCaptions";

/**
 * A walkthrough clip (core/finish.mjs): the screen recording, the narration and captions.
 *
 * - `shots` play in order. A clip can cross from a desktop screen to a phone (what the shop
 *   sees, then what the customer sees); a `phone` shot sits in a handset on a tinted ground
 *   so it still fills the same frame.
 * - `captions: "band"` puts the captions in a strip of their own UNDER the picture: on a POS
 *   screen the buttons a line is about sit along the bottom edge, exactly where an overlaid
 *   caption lands. `"overlay"` puts them over the picture, for clips that play in a 16:9 slot.
 * - `zooms` (edit.mjs) push in on the part of the screen a line works with, so small table
 *   text reads on a phone. Frames, within the shot; x/y/scale in recording pixels.
 *
 * Deliberately no intro card, outro or music: these play on a help page the viewer is
 * already reading, and anything before the first frame of the app is time spent not
 * answering their question.
 */
export type Zoom = { from: number; to: number; x: number; y: number; scale: number };
export type Shot = {
  videoSrc: string;
  frame?: "none" | "phone";
  durationInFrames: number;
  width: number;
  height: number;
  zooms?: Zoom[];
};

export type TrainingClipProps = {
  shots?: Shot[];
  audioSrc: string;
  wordTimings: WordTiming[];
  accentColor: string;
  captions?: "band" | "overlay";
  band?: number;
  background?: string;
  durationInFrames: number;
  /** The picture's size (the caption band, if any, is added below) */
  width: number;
  height: number;
  /** Older props: a single full-frame recording */
  videoSrc?: string;
  zooms?: Zoom[];
};

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

/** A full-frame recording, scaled to the picture, with its zooms. */
const Screen: React.FC<{ shot: Shot; width: number; height: number }> = ({ shot, width, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const v = viewAt(frame, shot.zooms || [], { x: shot.width / 2, y: shot.height / 2, scale: 1 }, fps);
  const fit = Math.min(width / shot.width, height / shot.height);
  const s = v.scale * fit;
  const transform = `translate(${width / 2 - v.x * s}px, ${height / 2 - v.y * s}px) scale(${s})`;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width, height, overflow: "hidden" }}>
      <OffthreadVideo src={staticFile(shot.videoSrc)} style={{ width: shot.width, height: shot.height, transformOrigin: "0 0", transform }} />
    </div>
  );
};

/** A portrait recording in a handset on a dark, tinted ground. Dark rather than light: the
 *  caption pill washes out over cream, and the phone reads better against depth. */
const Phone: React.FC<{ shot: Shot; width: number; height: number; accentColor: string }> = ({ shot, width, height, accentColor }) => {
  const rgb = accentColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  const [r, g, b] = rgb ? [rgb[1], rgb[2], rgb[3]] : ["45", "74", "62"];
  const bezel = Math.round(height * 0.015);
  const screenH = Math.round(height * 0.9);
  const screenW = Math.round((screenH * shot.width) / shot.height);
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width, height, backgroundColor: "#141a17", overflow: "hidden" }}>
      <AbsoluteFill style={{ background: `linear-gradient(165deg, rgba(${r},${g},${b},0.95) 0%, rgba(${r},${g},${b},0.45) 42%, rgba(10,14,12,0) 78%)` }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: Math.round(height * 0.02) }}>
        <div style={{
          width: screenW + bezel * 2, height: screenH + bezel * 2, borderRadius: Math.round(height * 0.064), padding: bezel,
          background: "linear-gradient(160deg, #2b2b2b 0%, #111 55%, #232323 100%)",
          boxShadow: "0 26px 60px rgba(0,0,0,.34), 0 3px 10px rgba(0,0,0,.22), inset 0 0 0 1.5px rgba(255,255,255,.09)",
        }}>
          <div style={{ width: "100%", height: "100%", borderRadius: Math.round(height * 0.049), overflow: "hidden", background: "#000" }}>
            <OffthreadVideo src={staticFile(shot.videoSrc)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        </div>
      </AbsoluteFill>
    </div>
  );
};

export const TrainingClip: React.FC<TrainingClipProps> = (props) => {
  const { audioSrc, wordTimings, accentColor, width, height, captions = "band", background = "#0f1720" } = props;
  const band = captions === "band" ? props.band ?? 120 : 0;
  const shots: Shot[] = props.shots?.length ? props.shots : [{
    videoSrc: props.videoSrc!, durationInFrames: props.durationInFrames, width, height, zooms: props.zooms,
  }];
  return (
    <AbsoluteFill style={{ backgroundColor: background }}>
      <Series>
        {shots.map((sh, i) => (
          <Series.Sequence key={`${sh.videoSrc}-${i}`} durationInFrames={sh.durationInFrames}>
            {sh.frame === "phone"
              ? <Phone shot={sh} width={width} height={height} accentColor={accentColor} />
              : <Screen shot={sh} width={width} height={height} />}
          </Series.Sequence>
        ))}
      </Series>
      {captions === "band"
        ? (
          <div style={{ position: "absolute", left: 0, right: 0, top: height, height: band }}>
            <WordHighlightCaptions wordTimings={wordTimings} style="minimal" accentColor={accentColor} bottom={22} />
          </div>
        )
        // A dark translucent pill: the recordings are of near-white UIs, so anything
        // transparent-backed loses its legibility exactly where the captions sit.
        : <WordHighlightCaptions wordTimings={wordTimings} style="minimal" accentColor={accentColor} />}
      <Audio src={staticFile(audioSrc)} />
    </AbsoluteFill>
  );
};

export const calculateTrainingClipMetadata = ({ props }: { props: TrainingClipProps }) => ({
  durationInFrames: props.durationInFrames,
  width: props.width,
  height: props.height + (props.captions === "overlay" ? 0 : props.band ?? 120),
});
