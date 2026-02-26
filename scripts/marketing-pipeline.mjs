#!/usr/bin/env node
/**
 * Marketing Pipeline — Recording → Finished Marketing Video
 *
 * Takes a raw recording directory and produces a MarketingDemo video with
 * presenter, Rhubarb lip sync, word-highlight captions, lower thirds,
 * zoom regions, and h265 optimization — fully automated.
 *
 * Usage:
 *   node scripts/marketing-pipeline.mjs <recording-dir> [flags]
 *   node scripts/marketing-pipeline.mjs ~/Movies/agent-recordings/pos-demo-xxx \
 *     --markers examples/pos-demo/register-markers.json \
 *     --name brother-pos-register
 *
 * Flags:
 *   --markers <path>          Segment markers JSON (phrase matching + labels + zoom)
 *   --name <string>           Output filename stem (default: derived from dir name)
 *   --preset draft|production Preset (draft skips h265/verify)
 *   --skip-h265              Skip h265 optimization step
 *   --no-verify              Skip render verification
 *   --no-presenter           Disable presenter character
 *   --whisper-model <model>  Whisper model (default: medium.en)
 *
 * Steps:
 *   1. Copy video to public/screen.mp4
 *   2. Probe duration via ffprobe
 *   3. Whisper transcription → word timings
 *   4. Rhubarb lip sync → mouth cues
 *   5. Match segment markers in transcript
 *   6. Build lower thirds + zoom regions
 *   7. Assemble MarketingDemo props
 *   8. Render with Remotion
 *   9. h265 optimize
 *  10. Copy to final-output/
 */
import { execSync, spawnSync } from "child_process";
import {
  readFileSync,
  writeFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  statSync,
} from "fs";
import { join, dirname, resolve, basename } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const DEMO_RENDER_DIR = join(PROJECT_ROOT, "demo-render");
const FPS = 30;

// ══════════════════════════════════════════════════════════════════════════
// Parse args
// ══════════════════════════════════════════════════════════════════════════
const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const flags = parseFlags(args);

const recordingDir = positional[0];
if (!recordingDir) {
  console.error("Usage: node scripts/marketing-pipeline.mjs <recording-dir> [flags]");
  console.error("");
  console.error("Flags:");
  console.error("  --markers <path>          Segment markers JSON");
  console.error("  --name <string>           Output filename stem");
  console.error("  --preset draft|production Preset");
  console.error("  --skip-h265              Skip h265 optimization");
  console.error("  --no-verify              Skip render verification");
  console.error("  --no-presenter           Disable presenter character");
  console.error("  --whisper-model <model>  Whisper model (default: medium.en)");
  process.exit(1);
}

const absRecordingDir = resolve(recordingDir);
const isDraft = flags.preset === "draft";
const outputName = flags.name || basename(absRecordingDir);
const skipH265 = flags["skip-h265"] === "true" || isDraft;
const skipVerify = flags["no-verify"] === "true" || isDraft;
const showPresenter = flags["no-presenter"] !== "true";
const whisperModel = flags["whisper-model"] || process.env.WHISPER_MODEL || "large-v3-turbo";

// Find the input video — try common names
const VIDEO_NAMES = ["output.mp4", "screen.mp4", "recording.mp4"];
let inputVideo = null;
for (const name of VIDEO_NAMES) {
  const p = join(absRecordingDir, name);
  if (existsSync(p)) { inputVideo = p; break; }
}
if (!inputVideo) {
  console.error(`Error: No video found in ${absRecordingDir}`);
  console.error(`  Looked for: ${VIDEO_NAMES.join(", ")}`);
  process.exit(1);
}

console.log(`\n╔══════════════════════════════════════════╗`);
console.log(`║  MARKETING PIPELINE                      ║`);
console.log(`║  Input: ${basename(absRecordingDir).slice(0, 31).padEnd(31)} ║`);
console.log(`║  Name:  ${outputName.slice(0, 31).padEnd(31)} ║`);
console.log(`║  Preset: ${(flags.preset || "default").padEnd(30)} ║`);
console.log(`╚══════════════════════════════════════════╝\n`);

// ══════════════════════════════════════════════════════════════════════════
// Step 1: Copy video to public/screen.mp4
// ══════════════════════════════════════════════════════════════════════════
console.log("═══ Step 1: Copy video to Remotion project ═══");
const screenPath = join(DEMO_RENDER_DIR, "public/screen.mp4");
copyFileSync(inputVideo, screenPath);
console.log(`  Copied ${inputVideo} → ${screenPath}`);

// ══════════════════════════════════════════════════════════════════════════
// Step 2: Probe video duration
// ══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Step 2: Probe video duration ═══");
const probeOut = spawnSync("ffprobe", [
  "-v", "quiet", "-print_format", "json", "-show_format", screenPath,
], { encoding: "utf8" });

if (probeOut.status !== 0) {
  console.error("  ERROR: ffprobe failed. Is ffmpeg installed?");
  process.exit(1);
}

const videoDurationSec = parseFloat(JSON.parse(probeOut.stdout).format.duration);
const videoDurationFrames = Math.round(videoDurationSec * FPS);
console.log(`  Duration: ${videoDurationSec.toFixed(3)}s = ${videoDurationFrames} frames`);

// ══════════════════════════════════════════════════════════════════════════
// Step 3: Whisper transcription
// ══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Step 3: Whisper word-level timestamps ═══");

const wavPath = "/tmp/marketing-pipeline-audio.wav";
spawnSync("ffmpeg", [
  "-y", "-i", screenPath, "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", wavPath,
], { encoding: "utf8", stdio: "pipe" });
console.log("  Audio extracted");

const { transcribeAudio } = await import("../lib/whisper.mjs");
const { wordTimings } = await transcribeAudio(wavPath, { model: whisperModel });

writeFileSync(
  join(DEMO_RENDER_DIR, "public/word-timings-whisper.json"),
  JSON.stringify(wordTimings, null, 2),
);
console.log(`  ${wordTimings.length} words, span: ${wordTimings[0].startMs}ms - ${wordTimings[wordTimings.length - 1].endMs}ms`);

// ══════════════════════════════════════════════════════════════════════════
// Step 4: Rhubarb lip sync
// ══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Step 4: Rhubarb lip sync ═══");

const rhubarbBin = join(PROJECT_ROOT, "bin/rhubarb");
let mouthCues = [];

if (existsSync(rhubarbBin)) {
  // Extract narration audio as WAV for Rhubarb (it needs regular WAV, not 16k)
  const rhubarbWav = "/tmp/marketing-pipeline-rhubarb.wav";
  spawnSync("ffmpeg", [
    "-y", "-i", screenPath, "-vn", "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "1", rhubarbWav,
  ], { encoding: "utf8", stdio: "pipe" });

  const rhubarbResult = spawnSync(rhubarbBin, [
    rhubarbWav, "-f", "json", "--quiet",
  ], { encoding: "utf8", stdio: "pipe" });

  if (rhubarbResult.status === 0 && rhubarbResult.stdout) {
    const rhubarbData = JSON.parse(rhubarbResult.stdout);
    mouthCues = rhubarbData.mouthCues || [];
    console.log(`  ${mouthCues.length} mouth cues generated`);
  } else {
    console.warn(`  WARNING: Rhubarb failed — continuing without lip sync`);
    if (rhubarbResult.stderr) console.warn(`  ${rhubarbResult.stderr.slice(0, 200)}`);
  }
} else {
  console.log(`  Rhubarb not found at ${rhubarbBin} — skipping lip sync`);
}

// ══════════════════════════════════════════════════════════════════════════
// Step 5: Match segment markers in transcript
// ══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Step 5: Match segment markers ═══");

// Load markers from file or auto-detect from sentence boundaries
let segmentMarkers = [];

if (flags.markers) {
  const markersPath = resolve(flags.markers);
  if (!existsSync(markersPath)) {
    console.error(`  ERROR: Markers file not found: ${markersPath}`);
    process.exit(1);
  }
  const markersData = JSON.parse(readFileSync(markersPath, "utf8"));
  segmentMarkers = markersData.markers || markersData;
  console.log(`  Loaded ${segmentMarkers.length} markers from ${markersPath}`);
} else {
  // Auto-detect segments from sentence boundaries (gaps > 500ms + punctuation)
  console.warn("  WARNING: No --markers file — auto-detecting segments from sentence boundaries");
  console.warn("  Labels will be generic. Consider providing a markers file for better results.");
  segmentMarkers = autoDetectSegments(wordTimings);
  console.log(`  Auto-detected ${segmentMarkers.length} segments`);
}

// Fuzzy phrase matching — handles sub-word tokens from large-v3-turbo
// (e.g. "Payment" → ["Pay","ment"], "Discounts" → ["Disc","ount","s"])
function normalize(text) {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findPhraseTime(phrase) {
  const target = normalize(phrase);

  // Sliding window: concatenate normalized tokens until we span enough characters
  for (let i = 0; i < wordTimings.length; i++) {
    let concat = "";
    let j = i;
    while (j < wordTimings.length && concat.length < target.length + 10) {
      concat += normalize(wordTimings[j].text);
      if (concat.includes(target)) {
        return { startMs: wordTimings[i].startMs, endMs: wordTimings[j].endMs };
      }
      j++;
    }
  }
  return null;
}

const segments = [];
for (const marker of segmentMarkers) {
  const timing = findPhraseTime(marker.phrase);
  if (timing) {
    segments.push({ ...marker, startSec: timing.startMs / 1000, endSec: timing.endMs / 1000 });
    console.log(`  ${(marker.action || "segment").padEnd(20)} @ ${(timing.startMs / 1000).toFixed(1)}s  ("${marker.phrase}")`);
  } else {
    console.warn(`  WARNING: Could not find phrase "${marker.phrase}" in narration`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Step 6: Build lower thirds + zoom regions
// ══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Step 6: Generate lower thirds and zoom regions ═══");

function secToFrame(sec) { return Math.round(sec * FPS); }

const lowerThirds = segments
  .filter((s) => s.label)
  .map((s) => ({
    label: s.label,
    startFrame: secToFrame(s.startSec),
    durationFrames: secToFrame(5),
  }));

console.log(`  ${lowerThirds.length} lower thirds:`);
for (const lt of lowerThirds) {
  console.log(`    "${lt.label}" @ frame ${lt.startFrame} (${(lt.startFrame / FPS).toFixed(1)}s)`);
}

// Zoom regions from markers
const zoomRegions = segments
  .filter((s) => s.zoom)
  .map((s) => {
    const z = s.zoom;
    const startSec = s.startSec + (z.offsetSec || 0);
    const durationSec = z.durationSec || 4;
    return {
      startFrame: secToFrame(startSec),
      endFrame: secToFrame(startSec + durationSec),
      focusX: z.focusX || 960,
      focusY: z.focusY || 450,
      scale: z.scale || 1.25,
    };
  });

console.log(`  ${zoomRegions.length} zoom regions`);

// Also check for action-log.json from the recording
const actionLogPath = join(absRecordingDir, "action-log.json");
if (existsSync(actionLogPath)) {
  const actionLog = JSON.parse(readFileSync(actionLogPath, "utf8"));
  console.log(`  Action log found: ${Object.keys(actionLog).join(", ")}`);
}

// ══════════════════════════════════════════════════════════════════════════
// Step 7: Assemble MarketingDemo props
// ══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Step 7: Assemble MarketingDemo props ═══");

const props = {
  wordTimings,
  lowerThirds,
  zoomRegions,
  callouts: [],
  showAvatar: false,
  showPresenter,
  mouthCues,
  audioVolume: 1.3,
  introDurationFrames: 240,
  transitionDurationFrames: 0,
  videoDurationFrames,
  outroDurationFrames: 180,
  captionStyle: "pop",
};

const propsPath = join(DEMO_RENDER_DIR, "props.json");
writeFileSync(propsPath, JSON.stringify(props, null, 2));

const totalFrames = props.introDurationFrames + props.transitionDurationFrames +
  props.videoDurationFrames + props.outroDurationFrames;
console.log(`  Written to ${propsPath}`);
console.log(`  Total duration: ${(totalFrames / FPS).toFixed(1)}s (${totalFrames} frames)`);
console.log(`  Presenter: ${showPresenter}, Mouth cues: ${mouthCues.length}`);
console.log(`  Lower thirds: ${lowerThirds.length}, Zoom regions: ${zoomRegions.length}`);

// ══════════════════════════════════════════════════════════════════════════
// Step 8: Render with Remotion
// ══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Step 8: Render with Remotion ═══");

const outDir = join(DEMO_RENDER_DIR, "out");
mkdirSync(outDir, { recursive: true });
const outputVideo = join(outDir, "demo-marketing.mp4");

const renderResult = spawnSync("npx", [
  "remotion", "render", "src/index.ts", "MarketingDemo", outputVideo,
  `--props=${propsPath}`, "--concurrency=4",
], { cwd: DEMO_RENDER_DIR, encoding: "utf8", stdio: "inherit", timeout: 600000 });

if (renderResult.status !== 0) {
  console.error("  ERROR: Remotion render failed");
  process.exit(1);
}

// Verify render (optional)
if (!skipVerify) {
  const verifyScript = join(DEMO_RENDER_DIR, "verify-render.mjs");
  if (existsSync(verifyScript)) {
    console.log("\n  Running verification...");
    spawnSync("node", [verifyScript, outputVideo], {
      cwd: DEMO_RENDER_DIR, encoding: "utf8", stdio: "inherit",
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Step 9: h265 optimize
// ══════════════════════════════════════════════════════════════════════════
let finalVideo = outputVideo;

if (!skipH265) {
  console.log("\n═══ Step 9: Optimize ═══");
  const optimizedPath = outputVideo.replace(".mp4", "-opt.mp4");

  const optResult = spawnSync("ffmpeg", [
    "-y", "-i", outputVideo,
    "-c:v", "libx264", "-crf", "26", "-preset", "slow",
    "-profile:v", "high", "-level", "4.0",
    "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "128k",
    optimizedPath,
  ], { encoding: "utf8", stdio: "pipe", timeout: 600000 });

  if (optResult.status === 0) {
    const origSize = statSync(outputVideo).size;
    const optSize = statSync(optimizedPath).size;
    const savings = ((1 - optSize / origSize) * 100).toFixed(1);
    console.log(`  ${(origSize / 1024 / 1024).toFixed(1)}MB → ${(optSize / 1024 / 1024).toFixed(1)}MB (${savings}% smaller)`);
    finalVideo = optimizedPath;
  } else {
    console.warn("  WARNING: Optimization failed — using original output");
    if (optResult.stderr) console.warn(`  ${optResult.stderr.slice(0, 300)}`);
  }
} else {
  console.log("\n═══ Step 9: Optimize (SKIPPED) ═══");
}

// ══════════════════════════════════════════════════════════════════════════
// Step 10: Copy to final-output/
// ══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Step 10: Copy to final output ═══");

const finalDir = join(PROJECT_ROOT, "final-output");
mkdirSync(finalDir, { recursive: true });

const finalName = `${outputName}-marketing.mp4`;
const finalPath = join(finalDir, finalName);
copyFileSync(finalVideo, finalPath);

const stats = statSync(finalPath);
console.log(`\n╔══════════════════════════════════════════╗`);
console.log(`║  MARKETING PIPELINE COMPLETE             ║`);
console.log(`╠══════════════════════════════════════════╣`);
console.log(`║  Output: ${finalName.slice(0, 31).padEnd(31)} ║`);
console.log(`║  Size:   ${(stats.size / 1024 / 1024).toFixed(1).padEnd(31)}MB ║`);
console.log(`║  Duration: ${(totalFrames / FPS).toFixed(1).padEnd(29)}s ║`);
console.log(`║  Path:   final-output/                   ║`);
console.log(`╚══════════════════════════════════════════╝`);

// ══════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].replace(/^--/, "");
      if (key.includes("=")) {
        const [k, v] = key.split("=", 2);
        flags[k] = v;
      } else if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        flags[key] = args[i + 1];
        i++;
      } else {
        flags[key] = "true";
      }
    }
  }
  return flags;
}

/**
 * Auto-detect segments from Whisper word timings when no markers file provided.
 * Uses gaps > 500ms combined with sentence-ending punctuation.
 */
function autoDetectSegments(wordTimings) {
  const segments = [];
  let segIdx = 0;

  for (let i = 1; i < wordTimings.length; i++) {
    const gap = wordTimings[i].startMs - wordTimings[i - 1].endMs;
    const prevText = wordTimings[i - 1].text;
    const endsWithPunctuation = /[.!?]$/.test(prevText);

    if (gap > 500 && endsWithPunctuation) {
      // Use the first 2-3 words of the new sentence as the phrase
      const phraseWords = [];
      for (let j = i; j < Math.min(i + 3, wordTimings.length); j++) {
        phraseWords.push(wordTimings[j].text.toLowerCase());
      }

      segments.push({
        action: `segment-${segIdx}`,
        phrase: phraseWords.join(" "),
        label: `Section ${segIdx + 1}`,
      });
      segIdx++;
    }
  }

  return segments;
}
