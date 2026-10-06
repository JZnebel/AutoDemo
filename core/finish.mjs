/**
 * Turn a recorded clip into the finished video.
 *
 *   node core/cli.mjs finish <project> <clip-id> <lang> [--accept-screen] [--no-cut] [--no-zoom]
 *
 * Lays each narration line onto the recording where the flow marked it, builds caption
 * word timings from the synthesiser's own, renders with captions (Remotion TrainingClip),
 * and encodes a small web copy plus a poster frame into out/.
 *
 * Before rendering: checks every line has a mark and fits its shot, and runs the screen
 * checks (checks.mjs — untranslated text, labels the narration names that never show;
 * --accept-screen renders anyway). Then, per shot, cuts the dead time where nobody speaks and
 * the screen only waits on the server (--no-cut), and zooms in on what each line works with
 * (--no-zoom, or "zoom": false on the clip in narration.json). Edits are in edit.mjs.
 *
 * After: normalizes loudness to -16 LUFS, reviews the render (black/frozen/silent spans,
 * duration) and writes sample frames + a report to out/review/<clip>.<lang>/. A clip that
 * fails is renamed .rejected.mp4 so it isn't published. Exits 1 on errors.
 */
import { execFileSync } from "child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { masterLoudness, printCheck, reviewRender } from "../lib/quality-checks.mjs";
import { screenChecks } from "./checks.mjs";
import { applyCuts, deadTime, frozenSpans, shift, zooms } from "./edit.mjs";
import { loadProject, loadTake } from "./project.mjs";

const project = await loadProject();
const { config } = project;
const [clipId, lang] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!clipId || !lang) { console.error("usage: finish <project> <clip-id> <lang>"); process.exit(1); }
const flag = (f) => process.argv.includes(f);
const FPS = 25;
const renderDir = join(project.root, "demo-render");
const render = { captions: "band", band: 120, background: "#0f1720", ...config.render };
const band = render.captions === "band" ? render.band : 0;

const clip = project.clip(clipId);
const audioDir = project.audio(clipId, lang);
const take = loadTake(project, clipId, lang);
const reviewDir = project.out("review", `${clipId}.${lang}`);
const tag = `${clipId} [${lang}]`;

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", ...opts });
const countFrames = (f) => Number(run("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0",
  "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", f]).trim());
const sizeOf = (f) => run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries",
  "stream=width,height", "-of", "csv=p=0", f]).trim().split(",").map(Number);
// When a line's speech ends (the mp3 carries trailing silence)
const lineSec = (l) => {
  const words = JSON.parse(readFileSync(join(audioDir, `${l.id}.words.json`), "utf8"));
  return (words.at(-1)?.endMs ?? 0) / 1000;
};
const lineOf = (id) => clip.lines.find((l) => l.id === id);

for (const shot of take.shots) {
  shot.frames = countFrames(shot.video);
  [shot.width, shot.height] = sizeOf(shot.video);
  shot.sec = shot.frames / FPS;
  shot.lines = Object.keys(shot.marks || {}).filter(lineOf).sort((a, b) => shot.marks[a] - shot.marks[b]);
}

// 0. Every line needs a mark, must not talk over the next one, and must finish before its
//    shot does (otherwise its end is cut off).
const quality = { lines: { errors: [], warnings: [] } };
const marked = new Set(take.shots.flatMap((s) => s.lines));
for (const l of clip.lines) if (!marked.has(l.id)) quality.lines.errors.push(`line "${l.id}" was never marked by the flow`);
for (const shot of take.shots) {
  shot.lines.forEach((id, i) => {
    const end = shot.marks[id] + lineSec(lineOf(id));
    const next = shot.lines[i + 1];
    if (next && end > shot.marks[next] + 0.25) quality.lines.warnings.push(`line "${id}" is still speaking ${(end - shot.marks[next]).toFixed(1)}s into "${next}"`);
    if (end > shot.sec + 0.1) quality.lines.errors.push(`line "${id}" ends at ${end.toFixed(1)}s but its recording ends at ${shot.sec.toFixed(1)}s — call ctx.finishSpeaking() at the end of the flow`);
  });
}
printCheck(`${tag} lines`, quality.lines);
if (quality.lines.errors.length) process.exit(1);

// 0b. What was on screen (checks.mjs): stop before rendering a take with untranslated text.
quality.screen = screenChecks(project, clipId, lang);
printCheck(`${tag} screen`, quality.screen);
if (quality.screen.errors.length && !flag("--accept-screen")) {
  mkdirSync(reviewDir, { recursive: true });
  writeFileSync(join(reviewDir, "quality.json"), JSON.stringify(quality, null, 2));
  console.log(`  not rendered — fix the app (or add the text to "screenAllow"), or pass --accept-screen`);
  process.exit(1);
}

// 1. Per shot: cut the dead time (the server thinking while nobody speaks), then decide zooms.
//    `at` collects every line's start on the finished clip's timeline.
const at = {};
const pub = join(renderDir, "public", "training");
mkdirSync(pub, { recursive: true });
quality.edit = { shots: [] };
let offset = 0;
take.shots.forEach((shot, i) => {
  const speech = shot.lines.map((id) => [shot.marks[id], shot.marks[id] + lineSec(lineOf(id))]);
  const cuts = flag("--no-cut") ? [] : deadTime({
    speech, duration: shot.sec, waits: (shot.busy || []).map((b) => [b.start, b.end]),
    frozen: frozenSpans(shot.video), actions: (shot.actions || []).map((a) => a.t),
  });
  shot.cut = shot.video;
  if (cuts.length) {
    shot.cut = shot.video.replace(/\.mp4$/, ".cut.mp4");
    applyCuts(shot.video, shot.cut, cuts, FPS);
    const total = cuts.reduce((t, [a, b]) => t + b - a, 0);
    console.log(`  ${take.shots.length > 1 ? `shot ${i + 1}: ` : ""}cut ${total.toFixed(1)}s of dead time: ${cuts.map(([a, b]) => `${a.toFixed(1)}–${b.toFixed(1)}s`).join(", ")}`);
  }
  shot.outFrames = cuts.length ? countFrames(shot.cut) : shot.frames;
  const local = Object.fromEntries(shot.lines.map((id) => [id, shift(shot.marks[id], cuts)]));
  for (const [id, t] of Object.entries(local)) at[id] = offset + t;
  // Zoom only where the recording fills the frame (not inside a phone handset).
  shot.zooms = flag("--no-zoom") || clip.zoom === false || shot.frame !== "none" ? [] : zooms({
    actions: (shot.actions || []).map((a) => ({ ...a, t: shift(a.t, cuts) })),
    starts: Object.values(local).sort((a, b) => a - b),
    duration: shot.outFrames / FPS, width: shot.width, height: shot.height,
  });
  if (shot.zooms.length) console.log(`  ${shot.zooms.length} zoom(s): ${shot.zooms.map((z) => `${z.from.toFixed(1)}–${z.to.toFixed(1)}s ×${z.scale}`).join(", ")}`);
  shot.src = `training/${project.config.name || "clip"}.${clipId}.${lang}${take.shots.length > 1 ? `.${i + 1}` : ""}.mp4`;
  copyFileSync(shot.cut, join(renderDir, "public", shot.src));
  quality.edit.shots.push({ cuts, zooms: shot.zooms });
  offset += shot.outFrames / FPS;
});
const frames = take.shots.reduce((t, s) => t + s.outFrames, 0);

// 2. Narration track: every line at its mark, padded to the clip's length.
const mixed = join(audioDir, "mix.mp3");
const inputs = clip.lines.flatMap((l) => ["-i", join(audioDir, `${l.id}.mp3`)]);
const filt = clip.lines.map((l, i) => {
  const ms = Math.round(at[l.id] * 1000);
  return `[${i}]adelay=${ms}|${ms}[a${i}];`;
}).join("") + clip.lines.map((_, i) => `[a${i}]`).join("") +
  `amix=inputs=${clip.lines.length}:normalize=0,apad=whole_dur=${(frames / FPS).toFixed(2)}[out]`;
run("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", filt, "-map", "[out]", "-b:a", "128k", mixed]);

// 3. Caption words, on the clip's timeline, with the punctuation edge_tts leaves off
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

// 4. Render. The canvas is the first full-frame shot's size (phone shots sit in a handset
//    inside it), plus the caption band under the picture if the project uses one.
const lead = take.shots.find((s) => s.frame === "none") || take.shots[0];
const canvas = lead.frame === "none" ? { width: lead.width, height: lead.height } : { width: 1280, height: 720 };
const audioSrc = `training/${project.config.name || "clip"}.${clipId}.${lang}.mp3`;
copyFileSync(mixed, join(renderDir, "public", audioSrc));
const props = {
  shots: take.shots.map((s) => ({
    videoSrc: s.src, frame: s.frame, durationInFrames: s.outFrames, width: s.width, height: s.height,
    zooms: s.zooms.map((z) => ({ ...z, from: Math.round(z.from * FPS), to: Math.round(z.to * FPS) })),
  })),
  audioSrc,
  wordTimings,
  accentColor: config.accentColor || "rgba(16,185,129,1)",
  captions: render.captions,
  band,
  background: render.background,
  durationInFrames: frames,
  width: canvas.width,
  height: canvas.height,
};
mkdirSync(project.path("props"), { recursive: true });
const propsPath = project.path("props", `${clipId}.${lang}.json`);
writeFileSync(propsPath, JSON.stringify(props, null, 1));
mkdirSync(project.out(), { recursive: true });
const full = project.out(`${clipId}.${lang}.full.mp4`);
run("npx", ["remotion", "render", "src/index.ts", "TrainingClip", full, `--props=${propsPath}`, "--log=error"],
  { cwd: renderDir, stdio: "inherit" });

masterLoudness(full);

// 5. Web copy: small, starts playing before it's all downloaded. And a poster frame from
//    just after the second line starts, so the still shows the app, not a blank page.
const web = project.out(`${clipId}.${lang}.mp4`);
run("ffmpeg", ["-v", "error", "-y", "-i", full, "-c:v", "libx264", "-preset", "slow", "-crf", "27",
  "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", web]);
// Taken with an empty caption strip: a player's controls sit over the bottom of the poster
// before play, and half a caption under them looks broken.
const posterAt = (at[clip.lines[1]?.id] ?? 2) + 1.5;
const posterShot = (() => { let t = 0; for (const s of take.shots) { if (posterAt < t + s.outFrames / FPS) return { s, at: posterAt - t }; t += s.outFrames / FPS; } return { s: take.shots[0], at: 1 }; })();
// With a caption band: the recording itself, padded with an empty band. A phone shot or
// overlaid captions: the rendered frame, so the handset is in it.
const hex = render.background.replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i, "#$1$1$2$2$3$3").replace("#", "0x");
const fromRecording = band > 0 && posterShot.s.frame === "none";
run("ffmpeg", ["-v", "error", "-y", "-ss", (fromRecording ? posterShot.at : posterAt).toFixed(2), "-i", fromRecording ? posterShot.s.cut : full,
  "-frames:v", "1", "-vf", fromRecording ? `pad=${posterShot.s.width}:${posterShot.s.height + band}:0:0:color=${hex}` : "null",
  "-q:v", "4", project.out(`${clipId}.${lang}.jpg`)]);
const mb = (Number(run("stat", ["-c", "%s", web]).trim()) / 1e6).toFixed(1);
console.log(`${tag}: ${(frames / FPS).toFixed(1)}s, ${canvas.width}x${canvas.height + band}, ${mb} MB -> ${web}`);

// 6. Review the web copy (what viewers get) and keep frames to look at.
rmSync(reviewDir, { recursive: true, force: true });
quality.render = reviewRender(web, { reviewDir, expectedDurationSec: frames / FPS });
printCheck(`${tag} render`, quality.render);
writeFileSync(join(reviewDir, "quality.json"), JSON.stringify(quality, null, 2));
if (quality.render.errors.length) {
  // Keep it out of publishing (which skips clips with no out/<clip>.<lang>.mp4)
  renameSync(web, web.replace(/\.mp4$/, ".rejected.mp4"));
  console.log(`  not publishable — moved to ${clipId}.${lang}.rejected.mp4`);
  process.exit(1);
} else if (existsSync(web.replace(/\.mp4$/, ".rejected.mp4"))) {
  rmSync(web.replace(/\.mp4$/, ".rejected.mp4"));
}
