/**
 * Generate Remotion input props for the full marketing demo.
 *
 * IMPORTANT: Timestamps below are from the ACTUAL VIDEO (verified by frame
 * extraction), NOT from TTS segment timings. When re-recording, you must
 * re-verify these by extracting frames: see verify-timing.mjs
 *
 * Usage:
 *   node generate-props.mjs > props.json
 *   npx remotion render src/index.ts Demo out/demo-marketing.mp4 --props="$(cat props.json)"
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FPS = 30;

// ── Word timings (from Whisper transcription of the ACTUAL video audio) ──
// These are extracted directly from the original narration track baked into
// screen.mp4 using OpenAI Whisper with word_timestamps=True.
// This avoids the timing drift caused by using a regenerated TTS pass.
const wordTimings = JSON.parse(
  readFileSync(join(__dirname, "public/word-timings-whisper.json"), "utf8")
);

function secToFrame(sec) {
  return Math.round(sec * FPS);
}

// ── ACTUAL VIDEO TIMELINE (verified via frame extraction) ────────────────
// 0-8s:   PIN login screen
// 9-16s:  Cash Drawer modal
// 17-26s: Register main view
// 27-34s: Customer search + details modal
// 35-41s: Product search ("blue") + add simple product
// 42-45s: Register with 1 item in cart
// 46-49s: Weight modal (Pink Kush) open
// 50-52s: Back to register, 2 items
// 53-56s: Variation modal (Girl Scout Cookies)
// 57-58s: Variation added to cart
// 59-61s: Discount modal
// 62-67s: Register with discount applied
// 68-71s: Cash Payment modal
// 72+:    Payment processing

// ── Lower thirds (feature labels) ───────────────────────────────────────
// Timed to the ACTUAL VIDEO, not TTS segments
const lowerThirds = [
  { label: "Quick PIN Login",        startFrame: secToFrame(2),    durationFrames: secToFrame(5) },
  { label: "Cash Drawer Management", startFrame: secToFrame(10),   durationFrames: secToFrame(5) },
  { label: "Customer Lookup",        startFrame: secToFrame(27),   durationFrames: secToFrame(6) },
  { label: "Product Search",         startFrame: secToFrame(35),   durationFrames: secToFrame(5) },
  { label: "Weight-Based Pricing",   startFrame: secToFrame(46),   durationFrames: secToFrame(4) },
  { label: "Product Variations",     startFrame: secToFrame(53),   durationFrames: secToFrame(4) },
  { label: "Built-In Discounts",     startFrame: secToFrame(59),   durationFrames: secToFrame(3) },
  { label: "Flexible Payments",      startFrame: secToFrame(65),   durationFrames: secToFrame(6) },
];

// ── Zoom regions ────────────────────────────────────────────────────────
// focusX/focusY = pixel coordinates in 1920x1080 space to zoom into
// Timed to the ACTUAL VIDEO
const zoomRegions = [
  // Zoom into PIN pad during login (frame_005 shows PIN screen)
  {
    startFrame: secToFrame(3),
    endFrame: secToFrame(7),
    focusX: 960,
    focusY: 480,
    scale: 1.3,
  },
  // Zoom into weight preset modal (frame_047 shows it open)
  {
    startFrame: secToFrame(46),
    endFrame: secToFrame(49),
    focusX: 960,
    focusY: 450,
    scale: 1.25,
  },
  // Zoom into cash payment modal (frame_068 shows it)
  {
    startFrame: secToFrame(68),
    endFrame: secToFrame(71),
    focusX: 960,
    focusY: 450,
    scale: 1.25,
  },
];

// ── Assemble props ──────────────────────────────────────────────────────
const props = {
  wordTimings,
  lowerThirds,
  zoomRegions,
  showAvatar: false,
  audioVolume: 1.3,
  introDurationFrames: 120,  // 4 seconds
  videoDurationFrames: 2272, // 75.7 seconds (exact video duration)
  outroDurationFrames: 150,  // 5 seconds
};

process.stdout.write(JSON.stringify(props));
