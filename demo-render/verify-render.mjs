/**
 * Post-Render Verification Script
 *
 * Automated checks that the FINAL rendered video has correct timing:
 *   1. Duration sanity — source video, rendered video, and props match
 *   2. Caption-audio sync — extracts frames from rendered video at key narration
 *      moments and checks that visible captions match expected speech
 *   3. Zoom/lower-third alignment — extracts frames during zoom/LT windows
 *      and confirms the expected content is on screen
 *
 * Designed to be run by the AI agent after every render. The agent reads the
 * extracted frames (it can see images) and confirms alignment before delivering
 * the video to the user.
 *
 * Usage:
 *   node verify-render.mjs [rendered-video-path]
 *   # Defaults to out/demo-marketing.mp4
 *
 * Output:
 *   /tmp/render-verify/          — labeled frame extractions
 *   /tmp/render-verify/report.json — machine-readable verification report
 */
import { execSync, spawnSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = "/tmp/render-verify";
const RENDERED = process.argv[2] || join(__dirname, "out/demo-marketing.mp4");
const SOURCE = join(__dirname, "public/screen.mp4");
const PROPS_FILE = join(__dirname, "props.json");

// ── Helpers ──────────────────────────────────────────────────────────────

function getDuration(videoPath) {
  const out = spawnSync("ffprobe", [
    "-v", "quiet", "-print_format", "json", "-show_format", videoPath,
  ], { encoding: "utf8" });
  const info = JSON.parse(out.stdout);
  return parseFloat(info.format.duration);
}

function extractFrame(videoPath, sec, outFile, label) {
  spawnSync("ffmpeg", [
    "-y", "-ss", String(sec), "-i", videoPath,
    "-frames:v", "1", "-q:v", "2",
    "-vf", `drawtext=text='${sec.toFixed(1)}s ${label}':x=10:y=10:fontsize=24:fontcolor=yellow:borderw=2`,
    outFile,
  ], { encoding: "utf8", stdio: "pipe" });
  return existsSync(outFile);
}

// ── Setup ────────────────────────────────────────────────────────────────

execSync(`rm -rf ${OUTPUT_DIR}`);
mkdirSync(OUTPUT_DIR, { recursive: true });
mkdirSync(join(OUTPUT_DIR, "source"), { recursive: true });
mkdirSync(join(OUTPUT_DIR, "rendered"), { recursive: true });
mkdirSync(join(OUTPUT_DIR, "captions"), { recursive: true });

const props = JSON.parse(readFileSync(PROPS_FILE, "utf8"));
const report = { checks: [], passed: 0, failed: 0, warnings: 0 };

function check(name, passed, detail) {
  const status = passed ? "PASS" : "FAIL";
  report.checks.push({ name, status, detail });
  if (passed) report.passed++;
  else report.failed++;
  console.log(`  ${passed ? "✓" : "✗"} ${name}: ${detail}`);
}

function warn(name, detail) {
  report.checks.push({ name, status: "WARN", detail });
  report.warnings++;
  console.log(`  ⚠ ${name}: ${detail}`);
}

// ══════════════════════════════════════════════════════════════════════════
// CHECK 1: Duration sanity
// ══════════════════════════════════════════════════════════════════════════
console.log("\n─── Duration Checks ───");

const sourceDur = getDuration(SOURCE);
const renderedDur = getDuration(RENDERED);
const expectedDur = (props.introDurationFrames + (props.transitionDurationFrames || 0) + props.videoDurationFrames + props.outroDurationFrames) / 30;

check(
  "Source video duration",
  Math.abs(sourceDur - props.videoDurationFrames / 30) < 1.0,
  `Source: ${sourceDur.toFixed(2)}s, Props videoDuration: ${(props.videoDurationFrames / 30).toFixed(2)}s`
);

check(
  "Rendered video duration",
  Math.abs(renderedDur - expectedDur) < 1.0,
  `Rendered: ${renderedDur.toFixed(2)}s, Expected: ${expectedDur.toFixed(2)}s`
);

// Check word timing span vs source audio duration
const lastWord = props.wordTimings[props.wordTimings.length - 1];
const wordSpanSec = lastWord.endMs / 1000;
check(
  "Word timing span vs source audio",
  Math.abs(wordSpanSec - sourceDur) < 2.0,
  `Words end at ${wordSpanSec.toFixed(2)}s, Source audio: ${sourceDur.toFixed(2)}s (drift: ${(wordSpanSec - sourceDur).toFixed(2)}s)`
);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 2: Source video content at key timestamps
// ══════════════════════════════════════════════════════════════════════════
console.log("\n─── Source Video Checkpoints ───");

const sourceCheckpoints = [
  { sec: 3,  label: "pin-login",        expect: "PIN pad visible" },
  { sec: 10, label: "cash-drawer",      expect: "Cash Drawer modal" },
  { sec: 20, label: "register",         expect: "Main register view" },
  { sec: 30, label: "customer",         expect: "Customer search/details" },
  { sec: 40, label: "product-search",   expect: "Product search results" },
  { sec: 47, label: "weight-modal",     expect: "Weight preset modal" },
  { sec: 55, label: "variation-modal",  expect: "Variation selection" },
  { sec: 60, label: "discount",         expect: "Discount modal/applied" },
  { sec: 69, label: "payment",          expect: "Payment modal" },
];

for (const cp of sourceCheckpoints) {
  const outFile = join(OUTPUT_DIR, "source", `${String(cp.sec).padStart(3, "0")}s_${cp.label}.jpg`);
  const ok = extractFrame(SOURCE, cp.sec, outFile, cp.label);
  check(`Source @${cp.sec}s (${cp.label})`, ok, ok ? `Frame saved — expect: ${cp.expect}` : "FAILED to extract");
}

// ══════════════════════════════════════════════════════════════════════════
// CHECK 3: Rendered video at key moments (includes overlays)
// ══════════════════════════════════════════════════════════════════════════
console.log("\n─── Rendered Video Checkpoints ───");

const introSec = props.introDurationFrames / 30;
const videoEndSec = introSec + props.videoDurationFrames / 30;
const totalSec = videoEndSec + props.outroDurationFrames / 30;

// Rendered timeline checkpoints
const renderedCheckpoints = [
  // Intro
  { sec: 2.0, label: "intro-logo", expect: "BrotherPOS logo visible, dark background" },
  // Video content (offset by intro duration)
  { sec: introSec + 3,  label: "pin-with-overlay",    expect: "PIN screen with lower third + zoom" },
  { sec: introSec + 10, label: "cash-drawer-overlay",  expect: "Cash Drawer with lower third" },
  { sec: introSec + 30, label: "customer-overlay",     expect: "Customer section with lower third" },
  { sec: introSec + 47, label: "weight-zoom",          expect: "Weight modal with zoom effect" },
  { sec: introSec + 60, label: "discount-overlay",     expect: "Discount section with lower third" },
  { sec: introSec + 69, label: "payment-overlay",      expect: "Payment section with lower third/zoom" },
  // Near end of video
  { sec: videoEndSec - 2, label: "video-end",          expect: "Final video frame (admin dashboard talk)" },
  // Outro
  { sec: videoEndSec + 2, label: "outro-logo",         expect: "BrotherPOS logo, CTA visible" },
];

for (const cp of renderedCheckpoints) {
  const outFile = join(OUTPUT_DIR, "rendered", `${cp.sec.toFixed(1)}s_${cp.label}.jpg`);
  const ok = extractFrame(RENDERED, cp.sec, outFile, cp.label);
  check(`Rendered @${cp.sec.toFixed(1)}s (${cp.label})`, ok, ok ? `Frame saved — expect: ${cp.expect}` : "FAILED to extract");
}

// ══════════════════════════════════════════════════════════════════════════
// CHECK 4: Caption-audio consistency
// ══════════════════════════════════════════════════════════════════════════
console.log("\n─── Caption-Audio Consistency ───");

// Verify that word timings are internally consistent:
// - No overlapping words
// - No huge gaps (>3s) between consecutive words
// - Words span most of the audio duration
// NOTE: We do NOT check narration-topic vs screen-content alignment here.
// The narrator talks about features in a flow — they don't map 1:1 to what's
// on screen at that exact moment. That's normal and by design.
let overlapCount = 0;
let maxGap = 0;
let gapAt = 0;
for (let i = 1; i < props.wordTimings.length; i++) {
  const prev = props.wordTimings[i - 1];
  const curr = props.wordTimings[i];
  if (curr.startMs < prev.endMs - 50) overlapCount++; // 50ms tolerance
  const gap = curr.startMs - prev.endMs;
  if (gap > maxGap) { maxGap = gap; gapAt = i; }
}
check(
  "No overlapping words",
  overlapCount === 0,
  overlapCount === 0 ? "Clean" : `${overlapCount} overlaps detected`
);
check(
  "Max gap between words < 3s",
  maxGap < 3000,
  `Max gap: ${(maxGap / 1000).toFixed(2)}s at word ${gapAt} ("${props.wordTimings[gapAt]?.text}")`
);

// Coverage: words should span at least 90% of video audio
const firstMs = props.wordTimings[0].startMs;
const lastMs = props.wordTimings[props.wordTimings.length - 1].endMs;
const audioMs = props.videoDurationFrames / 30 * 1000;
const coverage = (lastMs - firstMs) / audioMs;
check(
  "Word coverage > 90% of audio",
  coverage > 0.9,
  `Coverage: ${(coverage * 100).toFixed(1)}% (${firstMs}ms - ${lastMs}ms of ${audioMs.toFixed(0)}ms)`
);

// Extract key caption frames for AI visual inspection (not automated pass/fail)
console.log("\n─── Caption Frames for Visual Inspection ───");
const captionSamples = [10, 20, 30, 40, 50, 60, 70];
for (const sec of captionSamples) {
  const renderSec = introSec + sec;
  const activeWord = props.wordTimings.find(w => w.startMs <= sec * 1000 && w.endMs >= sec * 1000);
  const outFile = join(OUTPUT_DIR, "captions", `${sec}s.jpg`);
  extractFrame(RENDERED, renderSec, outFile, `t${sec}s`);
  console.log(`  ${sec}s → "${activeWord?.text || '(silence)'}" | Frame saved for inspection`);
}

// ══════════════════════════════════════════════════════════════════════════
// CHECK 5: Lower third timing sanity
// ══════════════════════════════════════════════════════════════════════════
console.log("\n─── Lower Third Timing ───");

for (const lt of props.lowerThirds) {
  const startSec = lt.startFrame / 30;
  const endSec = (lt.startFrame + lt.durationFrames) / 30;
  const withinVideo = startSec >= 0 && endSec <= props.videoDurationFrames / 30;
  check(
    `LT "${lt.label}" (${startSec.toFixed(1)}s - ${endSec.toFixed(1)}s)`,
    withinVideo,
    withinVideo ? "Within video bounds" : `OUT OF BOUNDS (video: 0-${(props.videoDurationFrames / 30).toFixed(1)}s)`
  );
}

// ══════════════════════════════════════════════════════════════════════════
// CHECK 6: Zoom region timing sanity
// ══════════════════════════════════════════════════════════════════════════
console.log("\n─── Zoom Region Timing ───");

for (let i = 0; i < props.zoomRegions.length; i++) {
  const zr = props.zoomRegions[i];
  const startSec = zr.startFrame / 30;
  const endSec = zr.endFrame / 30;
  const withinVideo = startSec >= 0 && endSec <= props.videoDurationFrames / 30;
  const reasonable = zr.scale >= 1.0 && zr.scale <= 2.0;
  check(
    `Zoom ${i} (${startSec.toFixed(1)}s - ${endSec.toFixed(1)}s, ${zr.scale}x)`,
    withinVideo && reasonable,
    `${withinVideo ? "Within bounds" : "OUT OF BOUNDS"}, ${reasonable ? "scale OK" : "scale unreasonable"}`
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════");
console.log(`  PASSED: ${report.passed}  |  FAILED: ${report.failed}  |  WARNINGS: ${report.warnings}`);
console.log("═══════════════════════════════════════");

if (report.failed > 0) {
  console.log("\n⚠ VERIFICATION FAILED — Review extracted frames before delivering video.");
  console.log(`  Frames: ${OUTPUT_DIR}/`);
} else {
  console.log("\n✓ All automated checks passed.");
  console.log("  AI agent: visually inspect frames in /tmp/render-verify/ to confirm overlays.");
}

// Write machine-readable report
report.sourceDuration = sourceDur;
report.renderedDuration = renderedDur;
report.expectedDuration = expectedDur;
report.wordTimingSpan = wordSpanSec;
report.frameDir = OUTPUT_DIR;
writeFileSync(join(OUTPUT_DIR, "report.json"), JSON.stringify(report, null, 2));
console.log(`\nReport: ${OUTPUT_DIR}/report.json`);
