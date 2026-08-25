/** Turn the recordings + word timings into Remotion props for each clip. */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { execFileSync } from "child_process";

const FPS = 25;
const spec = JSON.parse(readFileSync("rezweed-start/narration.json", "utf8"));

/**
 * edge_tts reports each spoken word without its punctuation, and
 * WordHighlightCaptions decides where to break a caption page by looking for
 * sentence-ending punctuation. Without this the test never matches, so pages
 * break purely on the six-word limit and run straight through full stops
 * ("...hit submit That's"). Re-attach the punctuation from the written line.
 */
function attachPunctuation(words, text) {
  const tokens = text.split(/\s+/).filter(Boolean);
  const bare = (t) => t.replace(/[^\p{L}\p{N}']/gu, "").toLowerCase();
  let ti = 0;
  return words.map((w) => {
    // Walk forward to the matching written token; fall back to the spoken form
    // if they ever drift apart rather than mislabelling the rest of the line.
    let text_ = w.word;
    for (let k = ti; k < Math.min(tokens.length, ti + 4); k++) {
      if (bare(tokens[k]) === bare(w.word)) { text_ = tokens[k]; ti = k + 1; break; }
    }
    return { text: text_, startMs: w.startMs, endMs: w.endMs };
  });
}
mkdirSync("rezweed-start/props", { recursive: true });

for (const c of spec.clips) {
  const video = `rezweed-start/raw/${c.id}.mp4`;
  const probe = execFileSync("ffprobe", ["-v", "error", "-count_frames",
    "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames,width,height",
    "-of", "csv=p=0", video], { encoding: "utf8" }).trim().split(",").map(Number);
  const [w, h, frames] = probe;
  // A portrait source is a phone recording, so it gets the handset frame; the
  // composition is 16:9 either way and the page slot never changes.
  const frame = h > w ? "phone" : "none";
  const words = JSON.parse(readFileSync(`rezweed-start/audio/${c.id}.words.json`, "utf8"));
  // A clip is either one continuous read (`text`) or lines pinned to beats
  // (`segments`); punctuation is recovered from whichever it has.
  const written = c.text ?? c.segments.map((g) => g.text).join(" ");
  const timed = attachPunctuation(words, written);
  const props = {
    videoSrc: `rezweed/${c.id}.mp4`,
    audioSrc: `rezweed/${c.id}.mp3`,
    // the component wants `text`; edge_tts gives `word`
    wordTimings: timed,
    accentColor: "rgba(45,74,62,1)",
    durationInFrames: frames,
    frame,
  };
  writeFileSync(`rezweed-start/props/${c.id}.json`, JSON.stringify(props, null, 1));
  console.log(`${c.id}: ${w}x${h} ${frames}f (${(frames / FPS).toFixed(1)}s) frame=${frame}, `
    + `${words.length} words, narration ends ${(words.at(-1).endMs / 1000).toFixed(1)}s`);
}
