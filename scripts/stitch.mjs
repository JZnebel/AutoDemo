#!/usr/bin/env node
/**
 * Stitch — Combine multiple rendered videos with transition cards
 *
 * Takes two or more rendered marketing videos and stitches them together
 * with an animated TransitionCard between sections, crossfade transitions,
 * and optional intro/outro trimming.
 *
 * Usage:
 *   node scripts/stitch.mjs \
 *     --parts final-output/register.mp4 final-output/admin.mp4 \
 *     --output final-output/full.mp4 \
 *     --transition-heading "Admin Dashboard" \
 *     --transition-subtitle "Managing Everything Behind the Scenes"
 *
 * Flags:
 *   --parts <file1> <file2> [...]     Input videos (2+)
 *   --output <path>                   Output file path
 *   --transition-heading <text>       Transition card heading
 *   --transition-subtitle <text>      Transition card subtitle
 *   --transition-duration <sec>       Transition card duration (default: 5)
 *   --crossfade-duration <sec>        Crossfade duration (default: 1.5)
 *   --outro-trim <sec>               Trim from end of part 1 (default: 5)
 *   --intro-skip <sec>               Skip from start of part 2 (default: 8)
 *   --skip-h265                      Skip h265 optimization
 *
 * Steps:
 *   1. Validate inputs, probe durations
 *   2. Render TransitionCard via Remotion
 *   3. Add silent audio track to transition card
 *   4. Trim part 1 end (remove outro), trim part 2 start (remove intro)
 *   5. ffmpeg xfade concat: part1 → crossfade → transition → crossfade → part2
 *   6. h265 optimize
 *   7. Copy to output path
 */
import { execSync, spawnSync } from "child_process";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  copyFileSync,
  statSync,
  unlinkSync,
} from "fs";
import { join, dirname, resolve, basename } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const DEMO_RENDER_DIR = join(PROJECT_ROOT, "demo-render");
const FPS = 30;
const TMP_DIR = "/tmp/stitch-work";

// ══════════════════════════════════════════════════════════════════════════
// Parse args
// ══════════════════════════════════════════════════════════════════════════
const args = process.argv.slice(2);
const flags = parseFlags(args);

// Collect --parts values (everything after --parts until next flag)
const parts = collectArrayFlag(args, "parts");
const outputPath = flags.output ? resolve(flags.output) : null;

const transitionHeading = flags["transition-heading"] || "Next Section";
const transitionSubtitle = flags["transition-subtitle"] || "";
const transitionDurationSec = parseFloat(flags["transition-duration"] || "5");
const crossfadeDurationSec = parseFloat(flags["crossfade-duration"] || "1.5");
const outroTrimSec = parseFloat(flags["outro-trim"] || "5");
const introSkipSec = parseFloat(flags["intro-skip"] || "8");
const skipH265 = flags["skip-h265"] === "true";

if (parts.length < 2 || !outputPath) {
  console.error("Usage: node scripts/stitch.mjs --parts <file1> <file2> [...] --output <path>");
  console.error("");
  console.error("Flags:");
  console.error("  --parts <files...>              Input videos (2+, required)");
  console.error("  --output <path>                 Output file path (required)");
  console.error("  --transition-heading <text>     Transition card heading");
  console.error("  --transition-subtitle <text>    Transition card subtitle");
  console.error("  --transition-duration <sec>     Transition card duration (default: 5)");
  console.error("  --crossfade-duration <sec>      Crossfade duration (default: 1.5)");
  console.error("  --outro-trim <sec>              Trim from end of part 1 (default: 5)");
  console.error("  --intro-skip <sec>              Skip from start of part 2 (default: 8)");
  console.error("  --skip-h265                     Skip h265 optimization");
  process.exit(1);
}

// Validate all parts exist
for (const part of parts) {
  if (!existsSync(part)) {
    console.error(`Error: Input file not found: ${part}`);
    process.exit(1);
  }
}

mkdirSync(TMP_DIR, { recursive: true });

console.log(`\n╔══════════════════════════════════════════╗`);
console.log(`║  STITCH — Combine Videos                 ║`);
console.log(`║  Parts: ${String(parts.length).padEnd(32)} ║`);
console.log(`║  Transition: ${transitionHeading.slice(0, 27).padEnd(27)} ║`);
console.log(`╚══════════════════════════════════════════╝\n`);

// ══════════════════════════════════════════════════════════════════════════
// Step 1: Validate inputs and probe durations
// ══════════════════════════════════════════════════════════════════════════
console.log("═══ Step 1: Validate inputs and probe durations ═══");

const partDurations = [];
for (const part of parts) {
  const dur = probeDuration(part);
  partDurations.push(dur);
  console.log(`  ${basename(part)}: ${dur.toFixed(2)}s`);
}

// ══════════════════════════════════════════════════════════════════════════
// Step 2: Render TransitionCard via Remotion
// ══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Step 2: Render TransitionCard ═══");

const transitionFrames = Math.round(transitionDurationSec * FPS);
const transitionVideo = join(TMP_DIR, "transition-card.mp4");

const transitionProps = JSON.stringify({
  heading: transitionHeading,
  subtitle: transitionSubtitle,
});

const transitionPropsPath = join(TMP_DIR, "transition-props.json");
writeFileSync(transitionPropsPath, transitionProps);

const renderResult = spawnSync("npx", [
  "remotion", "render", "src/index.ts", "TransitionCard", transitionVideo,
  `--props=${transitionPropsPath}`,
  `--frames=0-${transitionFrames - 1}`,
], { cwd: DEMO_RENDER_DIR, encoding: "utf8", stdio: "inherit", timeout: 120000 });

if (renderResult.status !== 0) {
  console.error("  ERROR: TransitionCard render failed");
  process.exit(1);
}
console.log(`  Rendered: ${transitionVideo} (${transitionDurationSec}s, ${transitionFrames} frames)`);

// ══════════════════════════════════════════════════════════════════════════
// Step 3: Add silent audio to transition card (ffmpeg concat needs same streams)
// ══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Step 3: Add silent audio to transition card ═══");

const transitionWithAudio = join(TMP_DIR, "transition-card-audio.mp4");
spawnSync("ffmpeg", [
  "-y", "-i", transitionVideo,
  "-f", "lavfi", "-i", `anullsrc=channel_layout=stereo:sample_rate=48000`,
  "-c:v", "copy", "-c:a", "aac", "-shortest",
  transitionWithAudio,
], { encoding: "utf8", stdio: "pipe" });
console.log("  Added silent audio track");

// ══════════════════════════════════════════════════════════════════════════
// Step 4: Trim parts
// ══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Step 4: Trim parts ═══");

const trimmedParts = [];

for (let i = 0; i < parts.length; i++) {
  const part = parts[i];
  const dur = partDurations[i];
  const trimmed = join(TMP_DIR, `part-${i}-trimmed.mp4`);

  if (i === 0 && outroTrimSec > 0) {
    // Trim outro from end of first part
    const trimEnd = dur - outroTrimSec;
    console.log(`  Part ${i + 1}: trimming last ${outroTrimSec}s (${dur.toFixed(1)}s → ${trimEnd.toFixed(1)}s)`);
    spawnSync("ffmpeg", [
      "-y", "-i", part,
      "-t", String(trimEnd),
      "-c:v", "libx264", "-preset", "fast", "-crf", "18",
      "-c:a", "aac", "-ar", "48000", "-ac", "2",
      trimmed,
    ], { encoding: "utf8", stdio: "inherit", timeout: 600000 });
    trimmedParts.push(trimmed);
  } else if (i === parts.length - 1 && introSkipSec > 0) {
    // Skip intro of last part
    const newDur = dur - introSkipSec;
    console.log(`  Part ${i + 1}: skipping first ${introSkipSec}s (${dur.toFixed(1)}s → ${newDur.toFixed(1)}s)`);
    // Re-encode on trim to avoid keyframe-based A/V desync from -c copy
    spawnSync("ffmpeg", [
      "-y", "-ss", String(introSkipSec), "-i", part,
      "-c:v", "libx264", "-preset", "fast", "-crf", "18",
      "-c:a", "aac", "-ar", "48000", "-ac", "2",
      trimmed,
    ], { encoding: "utf8", stdio: "inherit", timeout: 600000 });
    trimmedParts.push(trimmed);
  } else if (i > 0 && i < parts.length - 1) {
    // Middle parts: trim both ends
    const trimEnd = dur - outroTrimSec;
    console.log(`  Part ${i + 1}: trimming ${introSkipSec}s from start + ${outroTrimSec}s from end`);
    spawnSync("ffmpeg", [
      "-y", "-ss", String(introSkipSec), "-i", part,
      "-t", String(trimEnd - introSkipSec),
      "-c:v", "libx264", "-preset", "fast", "-crf", "18",
      "-c:a", "aac", "-ar", "48000", "-ac", "2",
      trimmed,
    ], { encoding: "utf8", stdio: "pipe" });
    trimmedParts.push(trimmed);
  } else {
    // No trimming needed (single-part edge case)
    trimmedParts.push(part);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Step 5: Concat with crossfade transitions
// ══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Step 5: Crossfade concat ═══");

// Parts are already re-encoded during trim — just ensure transition card matches
const normalizedParts = trimmedParts;

const normalizedTransition = join(TMP_DIR, "transition-normalized.mp4");
console.log(`  Normalizing transition card...`);
spawnSync("ffmpeg", [
  "-y", "-i", transitionWithAudio,
  "-c:v", "libx264", "-preset", "fast", "-crf", "18",
  "-c:a", "aac", "-ar", "48000", "-ac", "2",
  "-r", String(FPS),
  "-pix_fmt", "yuv420p",
  normalizedTransition,
], { encoding: "utf8", stdio: "inherit", timeout: 120000 });

// Build the sequence: part1 → transition → part2
// For 2 parts: [part0, transition, part1]
// For 3+ parts: [part0, transition, part1, transition, part2, ...]
const sequence = [normalizedParts[0]];
for (let i = 1; i < normalizedParts.length; i++) {
  sequence.push(normalizedTransition);
  sequence.push(normalizedParts[i]);
}

// Probe durations of normalized segments for xfade offsets
const seqDurations = sequence.map((f) => probeDuration(f));
console.log(`  Sequence: ${sequence.length} segments`);
for (let i = 0; i < sequence.length; i++) {
  console.log(`    ${i + 1}. ${basename(sequence[i])}: ${seqDurations[i].toFixed(2)}s`);
}

// Concat using the concat demuxer — keeps audio and video perfectly in sync.
// The transition card already provides a clean visual break, so no crossfade needed.
let stitchedVideo;

if (sequence.length === 1) {
  stitchedVideo = sequence[0];
} else {
  stitchedVideo = join(TMP_DIR, "stitched.mp4");

  // Write concat list
  const concatListPath = join(TMP_DIR, "concat.txt");
  const concatList = sequence.map((f) => `file '${f}'`).join("\n");
  writeFileSync(concatListPath, concatList);

  console.log(`  Running concat...`);
  const concatResult = spawnSync("ffmpeg", [
    "-y", "-f", "concat", "-safe", "0", "-i", concatListPath,
    "-c:v", "libx264", "-preset", "fast", "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    stitchedVideo,
  ], { encoding: "utf8", stdio: "pipe", timeout: 600000 });

  if (concatResult.status !== 0) {
    console.error("  ERROR: concat failed");
    if (concatResult.stderr) console.error(concatResult.stderr.slice(-500));
    process.exit(1);
  }
}

const stitchedDur = probeDuration(stitchedVideo);
console.log(`  Stitched: ${stitchedDur.toFixed(2)}s`);

// ══════════════════════════════════════════════════════════════════════════
// Step 6: h265 optimize
// ══════════════════════════════════════════════════════════════════════════
let finalVideo = stitchedVideo;

if (!skipH265) {
  console.log("\n═══ Step 6: Optimize ═══");
  const optimizedPath = join(TMP_DIR, "stitched-opt.mp4");

  const optResult = spawnSync("ffmpeg", [
    "-y", "-i", stitchedVideo,
    "-c:v", "libx264", "-crf", "26", "-preset", "slow",
    "-profile:v", "high", "-level", "4.0",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "128k",
    optimizedPath,
  ], { encoding: "utf8", stdio: "pipe", timeout: 600000 });

  if (optResult.status === 0) {
    const origSize = statSync(stitchedVideo).size;
    const optSize = statSync(optimizedPath).size;
    const savings = ((1 - optSize / origSize) * 100).toFixed(1);
    console.log(`  ${(origSize / 1024 / 1024).toFixed(1)}MB → ${(optSize / 1024 / 1024).toFixed(1)}MB (${savings}% smaller)`);
    finalVideo = optimizedPath;
  } else {
    console.warn("  WARNING: Optimization failed — using original output");
  }
} else {
  console.log("\n═══ Step 6: Optimize (SKIPPED) ═══");
}

// ══════════════════════════════════════════════════════════════════════════
// Step 7: Copy to output
// ══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Step 7: Copy to output ═══");

mkdirSync(dirname(outputPath), { recursive: true });
copyFileSync(finalVideo, outputPath);

const stats = statSync(outputPath);
console.log(`\n╔══════════════════════════════════════════╗`);
console.log(`║  STITCH COMPLETE                         ║`);
console.log(`╠══════════════════════════════════════════╣`);
console.log(`║  Output: ${basename(outputPath).slice(0, 31).padEnd(31)} ║`);
console.log(`║  Size:   ${(stats.size / 1024 / 1024).toFixed(1).padEnd(31)}MB ║`);
console.log(`║  Duration: ${stitchedDur.toFixed(1).padEnd(29)}s ║`);
console.log(`╚══════════════════════════════════════════╝`);

// Clean up temp files
try {
  const tmpFiles = [
    transitionVideo, transitionWithAudio, normalizedTransition,
    ...trimmedParts, ...normalizedParts,
  ];
  if (stitchedVideo.startsWith(TMP_DIR)) tmpFiles.push(stitchedVideo);
  if (finalVideo !== stitchedVideo && finalVideo.startsWith(TMP_DIR)) tmpFiles.push(finalVideo);
  for (const f of tmpFiles) {
    if (existsSync(f)) unlinkSync(f);
  }
} catch { /* ignore cleanup errors */ }

// ══════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════

function probeDuration(filePath) {
  const result = spawnSync("ffprobe", [
    "-v", "quiet", "-print_format", "json", "-show_format", filePath,
  ], { encoding: "utf8" });
  if (result.status !== 0) {
    console.error(`  ERROR: ffprobe failed for ${filePath}`);
    process.exit(1);
  }
  return parseFloat(JSON.parse(result.stdout).format.duration);
}

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].replace(/^--/, "");
      if (key === "parts") continue; // handled by collectArrayFlag
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
 * Collect all values after --parts until the next --flag.
 * Supports: --parts a.mp4 b.mp4 c.mp4 --output out.mp4
 */
function collectArrayFlag(args, flagName) {
  const values = [];
  let collecting = false;
  for (const arg of args) {
    if (arg === `--${flagName}`) {
      collecting = true;
      continue;
    }
    if (arg.startsWith("--")) {
      collecting = false;
      continue;
    }
    if (collecting) {
      values.push(resolve(arg));
    }
  }
  return values;
}
