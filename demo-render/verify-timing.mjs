/**
 * Timing Verification Script
 *
 * Extracts frames at each key timestamp from the video and outputs them
 * as labeled JPGs for visual verification. Run this BEFORE rendering to
 * confirm that zoom regions, lower thirds, and caption segments line up
 * with the actual video content.
 *
 * Usage:
 *   node verify-timing.mjs
 *   # Then open /tmp/timing-verify/ and check each frame
 *
 * This catches the #1 post-production bug: timing drift between TTS audio
 * and the screen recording. If you regenerate narration audio, the pacing
 * WILL differ from the original recording. Always verify against the actual
 * video frames, not TTS segment timestamps.
 */
import { execSync, spawnSync } from "child_process";
import { readFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = "/tmp/timing-verify";
const VIDEO = join(__dirname, "public/screen.mp4");

// Clean and create output dir
execSync(`rm -rf ${OUTPUT_DIR}`);
mkdirSync(OUTPUT_DIR, { recursive: true });

// Key moments to verify — label + expected timestamp (seconds into video)
// Update these whenever you change zoom regions or lower thirds
const checkpoints = [
  { sec: 3,  label: "pin-login-start",       expect: "PIN pad visible" },
  { sec: 7,  label: "pin-login-end",         expect: "PIN entered or transitioning" },
  { sec: 10, label: "cash-drawer-modal",     expect: "Open Cash Drawer modal" },
  { sec: 17, label: "register-appears",      expect: "Main register view" },
  { sec: 27, label: "customer-search",       expect: "Customer search active" },
  { sec: 33, label: "customer-details",      expect: "Alice Johnson modal" },
  { sec: 36, label: "product-search",        expect: "Search results for 'blue'" },
  { sec: 42, label: "product-added",         expect: "Item in cart" },
  { sec: 47, label: "weight-modal-open",     expect: "Pink Kush weight modal" },
  { sec: 50, label: "weight-selected",       expect: "Weight added, 2 items in cart" },
  { sec: 54, label: "variation-modal",       expect: "Girl Scout Cookies modal" },
  { sec: 59, label: "discount-modal",        expect: "Apply Discount modal" },
  { sec: 63, label: "discount-applied",      expect: "Register with discount in cart" },
  { sec: 68, label: "payment-modal",         expect: "Cash Payment modal" },
  { sec: 72, label: "payment-processing",    expect: "Processing payment" },
];

console.log(`Extracting ${checkpoints.length} verification frames from ${VIDEO}\n`);

let allPass = true;
for (const cp of checkpoints) {
  const outFile = join(OUTPUT_DIR, `${String(cp.sec).padStart(3, "0")}s_${cp.label}.jpg`);
  const result = spawnSync("ffmpeg", [
    "-y", "-ss", String(cp.sec), "-i", VIDEO,
    "-frames:v", "1", "-q:v", "3",
    "-vf", `scale=640:-1,drawtext=text='${cp.sec}s - ${cp.label}':x=10:y=10:fontsize=20:fontcolor=yellow:borderw=2`,
    outFile,
  ], { encoding: "utf8", stdio: "pipe" });

  if (existsSync(outFile)) {
    console.log(`  ✓ ${cp.sec}s  ${cp.label.padEnd(25)} → Expected: ${cp.expect}`);
  } else {
    console.log(`  ✗ ${cp.sec}s  ${cp.label.padEnd(25)} → FAILED to extract`);
    allPass = false;
  }
}

console.log(`\nFrames saved to: ${OUTPUT_DIR}/`);
console.log(`Open with: xdg-open ${OUTPUT_DIR}\n`);

if (allPass) {
  console.log("Review each frame and confirm the expected content is visible.");
  console.log("If any frame is wrong, update the timestamps in generate-props.mjs.");
} else {
  console.log("Some frames failed to extract. Check the video path.");
}

// Also extract a 1fps filmstrip for full overview
console.log("\nExtracting full 1fps filmstrip...");
execSync(`ffmpeg -y -i "${VIDEO}" -vf "fps=1,scale=320:-1,tile=10x8" "${OUTPUT_DIR}/filmstrip.jpg" 2>/dev/null`);
console.log(`Filmstrip: ${OUTPUT_DIR}/filmstrip.jpg`);
