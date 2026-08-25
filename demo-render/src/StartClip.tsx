import React from "react";
import { AbsoluteFill, Audio, OffthreadVideo, Series, staticFile } from "remotion";
import { WordHighlightCaptions, WordTiming } from "./components/WordHighlightCaptions";

/**
 * A help clip for rezweed.com/start — screen recording, narration, captions.
 *
 * Deliberately has no intro card, no outro CTA and no music bed. These play
 * inside a max-w-2xl column on a page the owner is already reading, on a phone,
 * often on poor signal. Anything before the first frame of the actual UI is time
 * spent not answering the question they clicked to have answered.
 */
export type StartClipProps = {
  videoSrc: string;
  audioSrc: string;
  wordTimings: WordTiming[];
  accentColor: string;
  durationInFrames: number;
  /** "phone" puts a portrait recording in a handset on a tinted ground, so a
   *  phone-shot clip still fills a 16:9 slot beside the desktop ones. */
  frame?: "none" | "phone";
  /** More than one shot, played in order. Needed once a clip has to cross between
   *  what the shop sees and what the customer sees — the till is a desktop screen
   *  and the card is a phone, and neither stands in for the other. Narration and
   *  captions run across the whole sequence, so they are timed against the joined
   *  length, not per shot. When set, videoSrc/frame above are ignored. */
  shots?: { videoSrc: string; frame?: "none" | "phone"; durationInFrames: number }[];
};

/** Screen size inside the handset. The recording is 390x844; this keeps that
 *  aspect exactly so nothing is squeezed, and leaves the lower band of the frame
 *  clear-ish for captions. */
const PHONE_SCREEN_H = 648;
const PHONE_SCREEN_W = Math.round((PHONE_SCREEN_H * 390) / 844);
const BEZEL = 11;

const PhoneFrame: React.FC<{ videoSrc: string; accentColor: string }> = ({ videoSrc, accentColor }) => {
  const rgb = accentColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  const [r, g, b] = rgb ? [rgb[1], rgb[2], rgb[3]] : ["45", "74", "62"];
  return (
    // A DARK ground, not a light one. The captions are a dark translucent pill;
    // over cream they washed out to unreadable grey, and the white phone reads
    // better against depth anyway. Solid base plus a separate tint layer rather
    // than one multi-stop radial shorthand, which rendered as flat black here.
    <AbsoluteFill style={{ backgroundColor: "#141a17" }}>
      <AbsoluteFill
        style={{
          background: `linear-gradient(165deg, rgba(${r},${g},${b},0.95) 0%, rgba(${r},${g},${b},0.45) 42%, rgba(10,14,12,0) 78%)`,
        }}
      />
      <AbsoluteFill
        style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: 14 }}
      >
        <div
        style={{
          width: PHONE_SCREEN_W + BEZEL * 2,
          height: PHONE_SCREEN_H + BEZEL * 2,
          borderRadius: 46,
          padding: BEZEL,
          background: "linear-gradient(160deg, #2b2b2b 0%, #111 55%, #232323 100%)",
          boxShadow: `0 26px 60px rgba(0,0,0,.34), 0 3px 10px rgba(0,0,0,.22),
                      inset 0 0 0 1.5px rgba(255,255,255,.09)`,
        }}
      >
          <div style={{ width: "100%", height: "100%", borderRadius: 35, overflow: "hidden", background: "#000" }}>
            <OffthreadVideo src={staticFile(videoSrc)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Shot: React.FC<{ videoSrc: string; frame: "none" | "phone"; accentColor: string }> = ({
  videoSrc, frame, accentColor,
}) => (frame === "phone"
  ? <PhoneFrame videoSrc={videoSrc} accentColor={accentColor} />
  : <OffthreadVideo src={staticFile(videoSrc)} />);

export const StartClip: React.FC<StartClipProps> = ({
  videoSrc, audioSrc, wordTimings, accentColor, frame = "none", shots,
}) => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    {shots?.length
      ? (
        <Series>
          {shots.map((sh, i) => (
            <Series.Sequence key={`${sh.videoSrc}-${i}`} durationInFrames={sh.durationInFrames}>
              <Shot videoSrc={sh.videoSrc} frame={sh.frame ?? "none"} accentColor={accentColor} />
            </Series.Sequence>
          ))}
        </Series>
      )
      : <Shot videoSrc={videoSrc} frame={frame} accentColor={accentColor} />}
    <Audio src={staticFile(audioSrc)} />
    {/* "minimal": a dark translucent pill. The recordings are of a near-white UI,
        so anything transparent-backed loses its legibility exactly where the
        captions sit. */}
    <WordHighlightCaptions
      wordTimings={wordTimings}
      style="minimal"
      accentColor={accentColor}
    />
  </AbsoluteFill>
);

export const calculateStartClipMetadata = ({ props }: { props: StartClipProps }) => ({
  durationInFrames: props.durationInFrames,
});
