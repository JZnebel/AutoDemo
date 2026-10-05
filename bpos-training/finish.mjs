/**
 * Turn a recorded clip into the finished video.
 *
 *   node bpos-training/finish.mjs <clip-id> <lang> [--accept-screen] [--no-cut] [--no-zoom]
 *
 * Lays each narration line onto the recording where the flow marked it, builds caption
 * word timings from the synthesiser's own, renders with captions (Remotion TrainingClip),
 * and encodes a small web copy plus a poster frame into out/.
 *
 * Before rendering: checks every line has a mark and fits the recording, and runs the screen
 * checks (checks.mjs — English left in a French take, labels the narration names that never
 * show; --accept-screen renders anyway). Then cuts the dead time where nobody speaks and the
 * screen only waits on the server (--no-cut), and zooms in on what each line works with
 * (--no-zoom, or "zoom": false on the clip in narration.json). Edits are in edit.mjs.
 *
 * After: normalizes loudness to -16 LUFS, reviews the render (black/frozen/silent spans,
 * duration) and writes sample frames + a report to out/review/<clip>.<lang>/. Exits 1 on
 * errors.
 */
import { execFileSync } from "child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { masterLoudness, printCheck, reviewRender } from "../lib/quality-checks.mjs";
import { screenChecks } from "./checks.mjs";
import { applyCuts, deadTime, frozenSpans, shift, zooms } from "./edit.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const renderDir = join(here, "..", "demo-render");
const [clipId, lang] = process.argv.slice(2);
if (!clipId || !lang) { console.error("usage: finish.mjs <clip-id> <lang>"); process.exit(1); }

const spec = JSON.parse(readFileSync(join(here, "narration.json"), "utf8"));
const clip = spec.clips.find((c) => c.id === clipId);
const audioDir = join(here, "audio", clipId, lang);
const raw = join(here, "raw", `${clipId}.${lang}.mp4`);
const { marks: rawMarks } = JSON.parse(readFileSync(raw.replace(/\.mp4$/, ".marks.json"), "utf8"));
const screenPath = raw.replace(/\.mp4$/, ".screen.json");
const screen = existsSync(screenPath) ? JSON.parse(readFileSync(screenPath, "utf8")) : { actions: [], busy: [] };
const flag = (f) => process.argv.includes(f);
const FPS = 25;

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", ...opts });
const countFrames = (f) => Number(run("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0",
  "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", f]).trim());
const rawFrames = countFrames(raw);
const [width, height] = run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries",
  "stream=width,height", "-of", "csv=p=0", raw]).trim().split(",").map(Number);

// 0. Every line needs a mark, must not talk over the next one, and must finish before the
//    recording does (otherwise its end is cut off).
const quality = { lines: { errors: [], warnings: [] } };
const clipSec = rawFrames / FPS;
const marks = rawMarks;
// When the speech ends (the mp3 itself carries trailing silence)
const lineSec = (l) => {
  const words = JSON.parse(readFileSync(join(audioDir, `${l.id}.words.json`), "utf8"));
  return (words.at(-1)?.endMs ?? 0) / 1000;
};
clip.lines.forEach((l, i) => {
  if (marks[l.id] == null) { quality.lines.errors.push(`line "${l.id}" was never marked by the flow`); return; }
  const end = marks[l.id] + lineSec(l);
  const next = clip.lines[i + 1] && marks[clip.lines[i + 1].id];
  if (next != null && end > next + 0.25) {
    quality.lines.warnings.push(`line "${l.id}" is still speaking ${(end - next).toFixed(1)}s into "${clip.lines[i + 1].id}"`);
  }
  if (end > clipSec + 0.1) {
    quality.lines.errors.push(`line "${l.id}" ends at ${end.toFixed(1)}s but the recording ends at ${clipSec.toFixed(1)}s — call ctx.finishSpeaking() at the end of the flow`);
  }
});
printCheck(`${clipId} [${lang}] lines`, quality.lines);
if (quality.lines.errors.length) process.exit(1);

// 0b. What was on screen (checks.mjs): stop before rendering a take with English in French.
quality.screen = screenChecks(clipId, lang);
printCheck(`${clipId} [${lang}] screen`, quality.screen);
if (quality.screen.errors.length && !flag("--accept-screen")) {
  const dir = join(here, "out", "review", `${clipId}.${lang}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "quality.json"), JSON.stringify(quality, null, 2));
  console.log(`  not rendered — fix the app (or add the text to "screenAllow"), or pass --accept-screen`);
  process.exit(1);
}

// 0c. Cut the dead time: the server thinking while nobody speaks.
const speech = clip.lines.map((l) => [marks[l.id], marks[l.id] + lineSec(l)]);
const cuts = flag("--no-cut") ? [] : deadTime({
  speech, duration: clipSec, waits: (screen.busy || []).map((b) => [b.start, b.end]), frozen: frozenSpans(raw),
  actions: (screen.actions || []).map((a) => a.t),
});
let video = raw;
if (cuts.length) {
  video = join(here, "raw", `${clipId}.${lang}.cut.mp4`);
  applyCuts(raw, video, cuts, FPS);
  const total = cuts.reduce((t, [a, b]) => t + b - a, 0);
  console.log(`  cut ${total.toFixed(1)}s of dead time: ${cuts.map(([a, b]) => `${a.toFixed(1)}–${b.toFixed(1)}s`).join(", ")}`);
}
const frames = cuts.length ? countFrames(video) : rawFrames;
const at = Object.fromEntries(Object.entries(marks).map(([k, t]) => [k, shift(t, cuts)]));
quality.edit = { cuts };

// 1. Narration track: every line at its mark, padded to the clip's length.
const mixed = join(audioDir, "mix.mp3");
const inputs = clip.lines.flatMap((l) => ["-i", join(audioDir, `${l.id}.mp3`)]);
const filt = clip.lines.map((l, i) => {
  const ms = Math.round(at[l.id] * 1000);
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
  const off = at[l.id] * 1000;
  return attachPunctuation(words, l[lang]).map((w) => ({ ...w, startMs: w.startMs + off, endMs: w.endMs + off }));
});

// Zoom in on what each line works with (in source pixels, on the cut timeline).
const zoomList = flag("--no-zoom") || clip.zoom === false ? [] : zooms({
  actions: (screen.actions || []).map((a) => ({ ...a, t: shift(a.t, cuts) })),
  starts: clip.lines.map((l) => at[l.id]).sort((x, y) => x - y),
  duration: frames / FPS, width, height,
});
quality.edit.zooms = zoomList;
if (zoomList.length) console.log(`  ${zoomList.length} zoom(s): ${zoomList.map((z) => `${z.from.toFixed(1)}–${z.to.toFixed(1)}s ×${z.scale}`).join(", ")}`);

// 3. Render.
const pub = join(renderDir, "public", "training");
mkdirSync(pub, { recursive: true });
copyFileSync(video, join(pub, `${clipId}.${lang}.mp4`));
copyFileSync(mixed, join(pub, `${clipId}.${lang}.mp3`));
const props = {
  videoSrc: `training/${clipId}.${lang}.mp4`,
  audioSrc: `training/${clipId}.${lang}.mp3`,
  wordTimings,
  zooms: zoomList.map((z) => ({ ...z, from: Math.round(z.from * FPS), to: Math.round(z.to * FPS) })),
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

masterLoudness(full);

// 4. Web copy: small, starts playing before it's all downloaded. And a poster frame from
//    just after the first line starts, so the still shows the register, not a blank page.
const web = join(outDir, `${clipId}.${lang}.mp4`);
run("ffmpeg", ["-v", "error", "-y", "-i", full, "-c:v", "libx264", "-preset", "slow", "-crf", "27",
  "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", web]);
// Taken from the recording, with an empty caption strip: the player's controls sit over
// the strip before play, and half a caption under them looks broken.
const posterAt = (at[clip.lines[1]?.id] ?? 2) + 1.5;
run("ffmpeg", ["-v", "error", "-y", "-ss", posterAt.toFixed(2), "-i", video, "-frames:v", "1",
  "-vf", `pad=${width}:${height + 120}:0:0:color=0x0f1720`, "-q:v", "4", join(outDir, `${clipId}.${lang}.jpg`)]);
const mb = (Number(run("stat", ["-c", "%s", web]).trim()) / 1e6).toFixed(1);
console.log(`${clipId} [${lang}]: ${(frames / FPS).toFixed(1)}s, ${width}x${height}, ${mb} MB -> ${web}`);

// 5. Review the web copy (what viewers get) and keep frames to look at.
const reviewDir = join(outDir, "review", `${clipId}.${lang}`);
rmSync(reviewDir, { recursive: true, force: true });
quality.render = reviewRender(web, { reviewDir, expectedDurationSec: frames / FPS });
printCheck(`${clipId} [${lang}] render`, quality.render);
writeFileSync(join(reviewDir, "quality.json"), JSON.stringify(quality, null, 2));
if (quality.render.errors.length) {
  // Keep it out of publish.mjs (which skips clips with no out/<clip>.<lang>.mp4)
  renameSync(web, web.replace(/\.mp4$/, ".rejected.mp4"));
  console.log(`  not publishable — moved to ${clipId}.${lang}.rejected.mp4`);
  process.exit(1);
}
