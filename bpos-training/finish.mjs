/**
 * Turn a recorded clip into the finished video.
 *
 *   node bpos-training/finish.mjs <clip-id> <lang>
 *
 * Lays each narration line onto the recording where the flow marked it, builds caption
 * word timings from the synthesiser's own, renders with captions (Remotion TrainingClip),
 * and encodes a small web copy plus a poster frame into out/.
 */
import { execFileSync } from "child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const renderDir = join(here, "..", "demo-render");
const [clipId, lang] = process.argv.slice(2);
if (!clipId || !lang) { console.error("usage: finish.mjs <clip-id> <lang>"); process.exit(1); }

const spec = JSON.parse(readFileSync(join(here, "narration.json"), "utf8"));
const clip = spec.clips.find((c) => c.id === clipId);
const audioDir = join(here, "audio", clipId, lang);
const raw = join(here, "raw", `${clipId}.${lang}.mp4`);
const { marks } = JSON.parse(readFileSync(raw.replace(/\.mp4$/, ".marks.json"), "utf8"));
const FPS = 25;

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", ...opts });
const frames = Number(run("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0",
  "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", raw]).trim());
const [width, height] = run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries",
  "stream=width,height", "-of", "csv=p=0", raw]).trim().split(",").map(Number);

// 1. Narration track: every line at its mark, padded to the clip's length.
const mixed = join(audioDir, "mix.mp3");
const inputs = clip.lines.flatMap((l) => ["-i", join(audioDir, `${l.id}.mp3`)]);
const filt = clip.lines.map((l, i) => {
  const ms = Math.round(marks[l.id] * 1000);
  return `[${i}]adelay=${ms}|${ms}[a${i}];`;
}).join("") + clip.lines.map((_, i) => `[a${i}]`).join("") +
  `amix=inputs=${clip.lines.length}:normalize=0,apad=whole_dur=${(frames / FPS).toFixed(2)}[out]`;
run("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", filt, "-map", "[out]", "-b:a", "128k", mixed]);

// 2. Caption words, on the clip's timeline, with the punctuation edge_tts leaves off
//    (the caption component breaks pages at sentence ends).
function attachPunctuation(words, text) {
  const tokens = text.split(/\s+/).filter(Boolean);
  const bare = (t) => t.replace(/[^\p{L}\p{N}']/gu, "").toLowerCase();
  let ti = 0;
  return words.map((w) => {
    // The synthesiser sometimes reports two words as one ("Daily Close"): match a run of
    // written tokens, so the run's punctuation still comes through.
    let shown = w.word;
    const want = bare(w.word);
    search: for (let k = ti; k < Math.min(tokens.length, ti + 4); k++) {
      for (let n = 1; n <= 3 && k + n <= tokens.length; n++) {
        const run = tokens.slice(k, k + n);
        if (bare(run.join("")) === want) { shown = run.join(" "); ti = k + n; break search; }
      }
    }
    return { text: shown, startMs: w.startMs, endMs: w.endMs };
  });
}
const wordTimings = clip.lines.flatMap((l) => {
  const words = JSON.parse(readFileSync(join(audioDir, `${l.id}.words.json`), "utf8"));
  const at = marks[l.id] * 1000;
  return attachPunctuation(words, l[lang]).map((w) => ({ ...w, startMs: w.startMs + at, endMs: w.endMs + at }));
});

// 3. Render.
const pub = join(renderDir, "public", "training");
mkdirSync(pub, { recursive: true });
copyFileSync(raw, join(pub, `${clipId}.${lang}.mp4`));
copyFileSync(mixed, join(pub, `${clipId}.${lang}.mp3`));
const props = {
  videoSrc: `training/${clipId}.${lang}.mp4`,
  audioSrc: `training/${clipId}.${lang}.mp3`,
  wordTimings,
  accentColor: "rgba(16,185,129,1)",
  durationInFrames: frames,
  width, height,
};
mkdirSync(join(here, "props"), { recursive: true });
const propsPath = join(here, "props", `${clipId}.${lang}.json`);
writeFileSync(propsPath, JSON.stringify(props, null, 1));
const outDir = join(here, "out");
mkdirSync(outDir, { recursive: true });
const full = join(outDir, `${clipId}.${lang}.full.mp4`);
run("npx", ["remotion", "render", "src/index.ts", "TrainingClip", full, `--props=${propsPath}`, "--log=error"],
  { cwd: renderDir, stdio: "inherit" });

// 4. Web copy: small, starts playing before it's all downloaded. And a poster frame from
//    just after the first line starts, so the still shows the register, not a blank page.
const web = join(outDir, `${clipId}.${lang}.mp4`);
run("ffmpeg", ["-v", "error", "-y", "-i", full, "-c:v", "libx264", "-preset", "slow", "-crf", "27",
  "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", web]);
// Taken from the recording, with an empty caption strip: the player's controls sit over
// the strip before play, and half a caption under them looks broken.
const posterAt = (marks[clip.lines[1]?.id] ?? 2) + 1.5;
run("ffmpeg", ["-v", "error", "-y", "-ss", posterAt.toFixed(2), "-i", raw, "-frames:v", "1",
  "-vf", `pad=${width}:${height + 120}:0:0:color=0x0f1720`, "-q:v", "4", join(outDir, `${clipId}.${lang}.jpg`)]);
const mb = (Number(run("stat", ["-c", "%s", web]).trim()) / 1e6).toFixed(1);
console.log(`${clipId} [${lang}]: ${(frames / FPS).toFixed(1)}s, ${width}x${height}, ${mb} MB -> ${web}`);
