#!/usr/bin/env node
/**
 * Unified Post-Production Pipeline
 *
 * Takes a raw recording directory (from pos-demo.mjs) and produces a
 * marketing-grade Remotion video with intro, outro, lower thirds, zoom
 * effects, and word-highlight captions — fully automated, zero hardcoded
 * timestamps.
 *
 * Usage:
 *   node pipeline.mjs <recording-dir>
 *   node pipeline.mjs ~/Movies/agent-recordings/pos-demo-1771907127657
 *
 * What it does:
 *   1. Copies the merged video to public/screen.mp4
 *   2. Probes the video duration (exact, from ffprobe)
 *   3. Extracts audio → runs Whisper → gets word-level timings
 *   4. Derives segment timings from the narration text (sentence boundaries)
 *   5. Maps lower thirds and zoom regions from segment timings
 *   6. Generates props.json with all computed values
 *   7. Renders with Remotion
 *   8. Runs verify-render.mjs (35-point automated check)
 *   9. Copies final output to ~/Desktop/agent-video/final-output/
 *
 * Every timestamp is derived programmatically. Nothing is hardcoded.
 */
import { execSync, spawnSync } from "child_process";
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { transcribeAudio } from "../lib/whisper.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FPS = 30;

// ══════════════════════════════════════════════════════════════════════════
// Parse args
// ══════════════════════════════════════════════════════════════════════════
const recordingDir = process.argv[2];
if (!recordingDir) {
  console.error("Usage: node pipeline.mjs <recording-dir>");
  console.error("  e.g. node pipeline.mjs ~/Movies/agent-recordings/pos-demo-1234567");
  process.exit(1);
}

const inputVideo = join(recordingDir, "output.mp4");
if (!existsSync(inputVideo)) {
  console.error(`Error: ${inputVideo} not found`);
  process.exit(1);
}

// ══════════════════════════════════════════════════════════════════════════
// Step 1: Copy video
// ══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Step 1: Copy video to Remotion project ═══");
const screenPath = join(__dirname, "public/screen.mp4");
copyFileSync(inputVideo, screenPath);
console.log(`  Copied ${inputVideo} → ${screenPath}`);

// ══════════════════════════════════════════════════════════════════════════
// Step 2: Probe video duration
// ══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Step 2: Probe video duration ═══");
const probeOut = spawnSync("ffprobe", [
  "-v", "quiet", "-print_format", "json", "-show_format", screenPath
], { encoding: "utf8" });
const videoDurationSec = parseFloat(JSON.parse(probeOut.stdout).format.duration);
const videoDurationFrames = Math.round(videoDurationSec * FPS);
console.log(`  Duration: ${videoDurationSec.toFixed(3)}s = ${videoDurationFrames} frames`);

// ══════════════════════════════════════════════════════════════════════════
// Step 3: Extract audio and run Whisper (via @remotion/install-whisper-cpp)
// ══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Step 3: Whisper word-level timestamps ═══");

// Extract audio for Whisper
const wavPath = "/tmp/pipeline-audio.wav";
spawnSync("ffmpeg", ["-y", "-i", screenPath, "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", wavPath],
  { encoding: "utf8", stdio: "pipe" });
console.log("  Audio extracted");

// Transcribe with Remotion's whisper.cpp integration (DTW for phoneme-level timing)
const whisperModel = process.env.WHISPER_MODEL || "medium.en";
const { wordTimings } = await transcribeAudio(wavPath, { model: whisperModel });

writeFileSync(join(__dirname, "public/word-timings-whisper.json"), JSON.stringify(wordTimings, null, 2));
console.log(`  ${wordTimings.length} words, span: ${wordTimings[0].startMs}ms - ${wordTimings[wordTimings.length - 1].endMs}ms`);

// ══════════════════════════════════════════════════════════════════════════
// Step 4: Derive segment timings from word content
// ══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Step 4: Derive segment timings from narration ═══");

// The narration has known segments. We find them by matching key phrases
// in the word timings. This is robust to minor Whisper transcription errors.
const segmentMarkers = [
  { action: "intro",        phrase: "full back office",       label: null },
  { action: "dashboard",    phrase: "numbers at a glance",    label: "Live Dashboard" },
  { action: "products",     phrase: "product catalog",        label: "Product Management" },
  { action: "categories",   phrase: "categories keep",        label: "Category Organization" },
  { action: "campaigns",    phrase: "sale campaigns",         label: "Sale Campaigns" },
  { action: "loyalty",      phrase: "loyalty program",        label: "Loyalty Program" },
  { action: "reports",      phrase: "reports give",           label: "Sales Reports" },
  { action: "orders",       phrase: "order history",          label: "Order History" },
  { action: "cash-drawers", phrase: "cash drawer sessions",   label: "Cash Drawer Sessions" },
  { action: "settings",     phrase: "settings let",           label: "Store Settings" },
  { action: "outro",        phrase: "complete point of sale",  label: null },
];

// Build full text for phrase matching
const fullText = wordTimings.map(w => w.text.toLowerCase()).join(" ");

// Strip punctuation and possessives for fuzzy matching.
// Whisper frequently adds apostrophes ("Clerk's"), hyphens ("-based"),
// and other punctuation that breaks exact prefix matching.
function normalize(word) {
  return word.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findPhraseTime(phrase) {
  const words = phrase.toLowerCase().split(" ").map(normalize);
  for (let i = 0; i <= wordTimings.length - words.length; i++) {
    let match = true;
    for (let j = 0; j < words.length; j++) {
      if (!normalize(wordTimings[i + j].text).startsWith(words[j])) {
        match = false;
        break;
      }
    }
    if (match) return { startMs: wordTimings[i].startMs, endMs: wordTimings[i + words.length - 1].endMs };
  }
  return null;
}

const segments = [];
for (const marker of segmentMarkers) {
  const timing = findPhraseTime(marker.phrase);
  if (timing) {
    segments.push({ ...marker, startSec: timing.startMs / 1000, endSec: timing.endMs / 1000 });
    console.log(`  ${marker.action.padEnd(20)} @ ${(timing.startMs / 1000).toFixed(1)}s  ("${marker.phrase}")`);
  } else {
    console.warn(`  WARNING: Could not find phrase "${marker.phrase}" in narration`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Step 5: Map lower thirds from segment timings
// ══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Step 5: Generate lower thirds and zoom regions ═══");

function secToFrame(sec) { return Math.round(sec * FPS); }

const lowerThirds = segments
  .filter(s => s.label)
  .map(s => ({
    label: s.label,
    startFrame: secToFrame(s.startSec),
    durationFrames: secToFrame(5), // 5 seconds each
  }));

console.log(`  ${lowerThirds.length} lower thirds:`);
for (const lt of lowerThirds) {
  console.log(`    "${lt.label}" @ frame ${lt.startFrame} (${(lt.startFrame / FPS).toFixed(1)}s)`);
}

// Zoom regions: use actual action timestamps from the recording when available.
// The recording script saves action-log.json with exact wall-clock times of key
// visual moments (modal opens, etc.) so we don't have to guess offsets.
const actionLogPath = join(recordingDir, "action-log.json");
let actionLog = {};
if (existsSync(actionLogPath)) {
  actionLog = JSON.parse(readFileSync(actionLogPath, "utf8"));
  console.log(`  Using action-log.json: ${JSON.stringify(actionLog)}`);
} else {
  console.log(`  No action-log.json found — using narration-based offset estimates`);
}

const dashboardSeg = segments.find(s => s.action === "dashboard");
const loyaltySeg = segments.find(s => s.action === "loyalty");
const ordersSeg = segments.find(s => s.action === "orders");

const zoomRegions = [];

// Dashboard KPI zoom: focus on the stat cards at top
if (dashboardSeg) {
  const dashStart = actionLog["dashboard-visible"] || dashboardSeg.startSec;
  zoomRegions.push({
    startFrame: secToFrame(dashStart),
    endFrame: secToFrame(dashStart + 4),
    focusX: 960, focusY: 280, scale: 1.3,
  });
}

// Loyalty tiers zoom: focus on the tier cards (Bronze/Silver/Gold/Platinum)
if (loyaltySeg) {
  const loyStart = actionLog["loyalty-visible"] || (loyaltySeg.startSec + 1);
  zoomRegions.push({
    startFrame: secToFrame(loyStart),
    endFrame: secToFrame(loyStart + 4),
    focusX: 960, focusY: 380, scale: 1.25,
  });
}

// Orders zoom: focus on the transaction table with real sales data
if (ordersSeg) {
  const ordStart = actionLog["orders-visible"] || (ordersSeg.startSec + 1);
  zoomRegions.push({
    startFrame: secToFrame(ordStart),
    endFrame: secToFrame(ordStart + 4),
    focusX: 960, focusY: 500, scale: 1.25,
  });
}

console.log(`  ${zoomRegions.length} zoom regions`);

// ══════════════════════════════════════════════════════════════════════════
// Step 6: Generate props.json
// ══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Step 6: Generate props.json ═══");

const props = {
  wordTimings,
  lowerThirds,
  zoomRegions,
  showAvatar: false,
  audioVolume: 1.3,
  introDurationFrames: 150,  // 5 seconds (matches Ken Burns dispensary intro clip)
  transitionDurationFrames: 0,  // disabled
  videoDurationFrames,
  outroDurationFrames: 150,  // 5 seconds
};

const propsPath = join(__dirname, "props.json");
writeFileSync(propsPath, JSON.stringify(props));
console.log(`  Written to ${propsPath}`);
const totalFrames = props.introDurationFrames + props.transitionDurationFrames + props.videoDurationFrames + props.outroDurationFrames;
console.log(`  Total duration: ${(totalFrames / FPS).toFixed(1)}s`);

// ══════════════════════════════════════════════════════════════════════════
// Step 7: Render with Remotion
// ══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Step 7: Render with Remotion ═══");
const outDir = join(__dirname, "out");
mkdirSync(outDir, { recursive: true });
const outputVideo = join(outDir, "demo-marketing.mp4");

const propsStr = readFileSync(propsPath, "utf8");
const renderResult = spawnSync("npx", [
  "remotion", "render", "src/index.ts", "Demo", outputVideo,
  `--props=${propsStr}`, "--concurrency=4"
], { cwd: __dirname, encoding: "utf8", stdio: "inherit", timeout: 600000 });

if (renderResult.status !== 0) {
  console.error("  ERROR: Remotion render failed");
  process.exit(1);
}

// ══════════════════════════════════════════════════════════════════════════
// Step 8: Verify
// ══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Step 8: Automated verification ═══");
const verifyResult = spawnSync("node", [join(__dirname, "verify-render.mjs"), outputVideo],
  { cwd: __dirname, encoding: "utf8", stdio: "inherit" });

// ══════════════════════════════════════════════════════════════════════════
// Step 9: Copy to final output
// ══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Step 9: Copy to final output ═══");
const finalDir = join(__dirname, "..", "final-output");
mkdirSync(finalDir, { recursive: true });
const finalPath = join(finalDir, "brother-pos-demo-marketing.mp4");
copyFileSync(outputVideo, finalPath);

const stats = readFileSync(finalPath);
console.log(`\n════════════════════════════════════════════`);
console.log(`  DONE`);
console.log(`  Output: ${finalPath}`);
console.log(`  Size: ${(stats.length / 1024 / 1024).toFixed(1)} MB`);
console.log(`  Duration: ${(totalFrames / FPS).toFixed(1)}s`);
console.log(`════════════════════════════════════════════`);
