#!/usr/bin/env node

/**
 * Screencast Pipeline
 *
 * Takes a raw screencast video + timeline JSONL and produces a polished
 * narrated demo video. Handles speed ramps, dead-time cuts, AI narration,
 * TTS, Whisper word timing, and Remotion rendering.
 *
 * Usage:
 *   node scripts/screencast-pipeline.mjs <recording.mp4|.webm> [timeline.jsonl] [flags]
 *
 * If timeline.jsonl is not provided, looks for it next to the recording with same basename.
 *
 * Flags:
 *   --preset draft|production     (draft = edge TTS, skip verify; production = elevenlabs)
 *   --skip-edit                   Use raw video without speed ramps
 *   --skip-narration              Skip narration generation (use existing)
 *   --no-narration-driven         Disable narration-driven editing (use classification-based)
 *   --speed-loading <N>           Loading speed multiplier (default: 6)
 *   --cut-threshold <ms>          Dead time cut threshold (default: 3000)
 *   --output-dir <path>           Output directory (default: screencast-output/)
 *   --name <string>               Output filename base
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, statSync } from "fs";
import { join, dirname, resolve, basename, extname } from "path";
import { fileURLToPath } from "url";
import { execSync, spawnSync } from "child_process";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
dotenv.config({ path: join(ROOT, ".env") });

const FPS = 30;

// ═══════════════════════════════════════════════════════════════════════
// Parse CLI args
// ═══════════════════════════════════════════════════════════════════════
const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const recordingPath = positional[0];
let timelinePath = positional[1] || null;

if (!recordingPath) {
  console.error("Usage: node scripts/screencast-pipeline.mjs <recording.mp4|.webm> [timeline.jsonl] [flags]");
  console.error("");
  console.error("Flags:");
  console.error("  --preset draft|production     Service quality preset");
  console.error("  --skip-edit                   Use raw video without speed ramps");
  console.error("  --skip-narration              Skip narration generation (use existing)");
  console.error("  --no-narration-driven         Disable narration-driven editing (use classification-based)");
  console.error("  --speed-loading <N>           Loading speed multiplier (default: 6)");
  console.error("  --cut-threshold <ms>          Dead time cut threshold (default: 3000)");
  console.error("  --output-dir <path>           Output directory (default: screencast-output/)");
  console.error("  --name <string>               Output filename base");
  process.exit(1);
}

const skipEdit = args.includes("--skip-edit");
const skipNarration = args.includes("--skip-narration");
const narrationDriven = !args.includes("--no-narration-driven"); // default: true
const narrationSource = parseFlag("narration"); // --narration <path> to override narration.json source
const preset = parseFlag("preset");
const speedLoading = parseFloat(parseFlag("speed-loading") || "6");
const cutThreshold = parseInt(parseFlag("cut-threshold") || "3000", 10);
const outputDir = resolve(parseFlag("output-dir") || join(ROOT, "screencast-output"));
const outputName = parseFlag("name") || basename(recordingPath, extname(recordingPath));

// Preset config
const PRESETS = {
  draft: { tts: "edge", whisperModel: "base.en", verify: false },
  production: { tts: "elevenlabs", whisperModel: "medium.en", verify: true },
};
const presetConfig = PRESETS[preset] || {};
const ttsProvider = parseFlag("tts") || presetConfig.tts || process.env.TTS_PROVIDER || "edge";
const whisperModel = presetConfig.whisperModel || process.env.WHISPER_MODEL || "medium.en";

// Set env vars for downstream modules
process.env.TTS_PROVIDER = ttsProvider;
process.env.WHISPER_MODEL = whisperModel;

// ═══════════════════════════════════════════════════════════════════════
// Step 1: Validate inputs
// ═══════════════════════════════════════════════════════════════════════
console.log("\n══════════════════════════════════════════");
console.log("STEP 1: Validate inputs");
console.log("══════════════════════════════════════════\n");

const absRecording = resolve(recordingPath);
if (!existsSync(absRecording)) {
  console.error(`Recording not found: ${absRecording}`);
  process.exit(1);
}
console.log(`  Recording: ${absRecording}`);

// Auto-detect timeline JSONL if not provided
if (!timelinePath && !skipEdit) {
  const baseName = basename(absRecording, extname(absRecording));
  const candidates = [
    join(dirname(absRecording), `${baseName}.jsonl`),
    join(dirname(absRecording), "walkthrough.jsonl"),
    join(dirname(absRecording), "timeline.jsonl"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      timelinePath = candidate;
      break;
    }
  }
}

if (timelinePath) {
  const absTimeline = resolve(timelinePath);
  if (!existsSync(absTimeline)) {
    console.error(`Timeline JSONL not found: ${absTimeline}`);
    process.exit(1);
  }
  timelinePath = absTimeline;
  console.log(`  Timeline: ${timelinePath}`);
} else if (!skipEdit) {
  console.warn("  WARNING: No timeline JSONL found — will use raw video (equivalent to --skip-edit)");
}

// Create output directory
mkdirSync(outputDir, { recursive: true });
console.log(`  Output dir: ${outputDir}`);

// Probe video duration
const probeOut = spawnSync("ffprobe", [
  "-v", "quiet", "-print_format", "json", "-show_format", absRecording,
], { encoding: "utf8" });

if (probeOut.status !== 0) {
  console.error("  ERROR: ffprobe failed — is ffmpeg installed?");
  process.exit(1);
}

const probeData = JSON.parse(probeOut.stdout);
const rawDurationSec = parseFloat(probeData.format.duration);
console.log(`  Raw duration: ${rawDurationSec.toFixed(1)}s`);
console.log(`  Preset: ${preset || "default"} (TTS: ${ttsProvider}, Whisper: ${whisperModel})`);

// ═══════════════════════════════════════════════════════════════════════
// Step 2: Edit video (speed ramps + cuts)
// ═══════════════════════════════════════════════════════════════════════
console.log("\n══════════════════════════════════════════");
console.log("STEP 2: Edit video (speed ramps + cuts)");
console.log("══════════════════════════════════════════\n");

const editedPath = join(outputDir, "edited.mp4");

// Parse timeline early — needed by both edit modes and narration hints
let timeline = [];
if (timelinePath && !skipEdit) {
  try {
    const { parseTimeline: pt } = await import(join(ROOT, "lib", "video-editor.mjs"));
    console.log("  Parsing timeline...");
    timeline = pt(timelinePath);
    console.log(`  ${timeline.length} timeline entries`);
  } catch (err) {
    console.error(`  Timeline parse failed: ${err.message}`);
  }
}

// In narration-driven mode, defer the actual edit until after narration + word timings
// are available (after Step 6). For now, just note the mode.
let editDeferred = false;

if (skipEdit || !timelinePath) {
  console.log("  Skipping edit — copying raw recording");
  copyFileSync(absRecording, editedPath);
  console.log(`  Copied to: ${editedPath}`);
} else if (narrationDriven) {
  console.log("  Narration-driven mode: deferring edit until after TTS + Whisper (Step 6b)");
  console.log("  (Video segments will be stretched/compressed to match narration timing)");
  editDeferred = true;
  // Copy raw for now — will be replaced after Step 6
  copyFileSync(absRecording, editedPath);
} else {
  try {
    const { buildEditList, editVideo } = await import(join(ROOT, "lib", "video-editor.mjs"));

    console.log("  Building classification-based edit list...");
    const editList = buildEditList(timeline, {
      speedLoading,
      cutThreshold,
    });
    console.log(`  ${editList.length} edit segments`);

    console.log("  Applying edits...");
    editVideo(absRecording, editList, editedPath);
    console.log(`  Edited video: ${editedPath}`);
  } catch (err) {
    console.error(`  Edit failed: ${err.message}`);
    console.log("  Falling back to raw video copy");
    copyFileSync(absRecording, editedPath);
  }
}

// Probe edited video duration (will be re-probed after narration-driven edit)
let editedDurationSec;
let editedDurationFrames;

function probeEditedDuration() {
  const editedProbe = spawnSync("ffprobe", [
    "-v", "quiet", "-print_format", "json", "-show_format", editedPath,
  ], { encoding: "utf8" });
  editedDurationSec = parseFloat(JSON.parse(editedProbe.stdout).format.duration);
  editedDurationFrames = Math.round(editedDurationSec * FPS);
  console.log(`  Edited duration: ${editedDurationSec.toFixed(1)}s (${editedDurationFrames} frames)`);
}

probeEditedDuration();

// ═══════════════════════════════════════════════════════════════════════
// Step 3: Generate narration hints from timeline
// ═══════════════════════════════════════════════════════════════════════
console.log("\n══════════════════════════════════════════");
console.log("STEP 3: Generate narration hints from timeline");
console.log("══════════════════════════════════════════\n");

const hintsPath = join(outputDir, "narration-hints.json");
let hints = [];

if (timelinePath) {
  const rawTimeline = readFileSync(timelinePath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);

  console.log(`  Loaded ${rawTimeline.length} JSONL entries`);

  // Generate human-readable action descriptions (filter out observe/meta tools)
  const SKIP_TOOLS = new Set([
    "take_snapshot", "take_screenshot", "screenshot", "list_pages",
    "evaluate_script", "screencast_start", "screencast_stop",
    "select_page", "new_page",
  ]);

  const actionDescriptions = rawTimeline
    .filter((entry) => entry.type === "start") // only start entries, not end
    .map((entry) => {
      const tool = entry.tool || entry.action || "";
      const params = entry.input || entry.params || {};

      if (SKIP_TOOLS.has(tool)) return null;

      switch (tool) {
        case "click":
          return `Click button/link`;
        case "fill":
          return `Type '${(params.value || "").substring(0, 50)}'`;
        case "type_text":
          return `Type '${(params.text || "").substring(0, 50)}'`;
        case "navigate_page":
        case "navigate":
          return params.type === "url" ? `Navigate to ${params.url || "page"}` : `Navigate ${params.type || "page"}`;
        case "wait_for":
          return `[page loads]`;
        case "hover":
          return `Hover over element`;
        case "press_key":
          return `Press ${params.key || "key"}`;
        case "scroll":
          return `Scroll ${params.direction || "down"}`;
        default:
          return null;
      }
    }).filter(Boolean);

  // Group consecutive actions into scenes (separated by navigation/loading)
  const scenes = [];
  let currentScene = { actions: [], index: 0 };

  for (const desc of actionDescriptions) {
    if (desc.startsWith("Navigate") || desc.startsWith("Wait for")) {
      // Navigation boundaries create scene breaks
      if (currentScene.actions.length > 0) {
        scenes.push(currentScene);
      }
      currentScene = { actions: [], index: scenes.length };
    }
    currentScene.actions.push(desc);
  }
  if (currentScene.actions.length > 0) {
    scenes.push(currentScene);
  }

  hints = scenes.map((scene, i) => ({
    sceneIndex: i,
    actions: scene.actions,
    description: scene.actions.join(". "),
  }));

  console.log(`  Generated ${hints.length} scene hints`);
  for (const hint of hints) {
    const preview = hint.description.substring(0, 80);
    console.log(`    Scene ${hint.sceneIndex}: ${preview}${hint.description.length > 80 ? "..." : ""}`);
  }
} else {
  console.log("  No timeline — generating generic hint");
  hints = [{
    sceneIndex: 0,
    actions: ["Walkthrough of the application"],
    description: "A guided walkthrough of the application features.",
  }];
}

writeFileSync(hintsPath, JSON.stringify(hints, null, 2));
console.log(`  Hints written: ${hintsPath}`);

// ═══════════════════════════════════════════════════════════════════════
// Step 4: Generate narration text
// ═══════════════════════════════════════════════════════════════════════
console.log("\n══════════════════════════════════════════");
console.log("STEP 4: Generate narration text");
console.log("══════════════════════════════════════════\n");

const narrationPath = join(outputDir, "narration.json");

let narration;

// If --narration <path> provided, copy it to outputDir first (avoids hook overwrites)
if (narrationSource) {
  const absNarrationSource = resolve(narrationSource);
  if (!existsSync(absNarrationSource)) {
    console.error(`  ❌ Narration source not found: ${absNarrationSource}`);
    process.exit(1);
  }
  console.log(`  Copying narration from: ${absNarrationSource}`);
  copyFileSync(absNarrationSource, narrationPath);
}

if ((skipNarration || narrationSource) && existsSync(narrationPath)) {
  console.log("  Loading narration from file");
  narration = JSON.parse(readFileSync(narrationPath, "utf8"));
  console.log(`  Loaded narration: ${narration.segments?.length || 0} segments, ${narration.fullText?.length || 0} chars`);
} else {
  narration = await generateNarration(hints);
  writeFileSync(narrationPath, JSON.stringify(narration, null, 2));
  console.log(`  Narration written: ${narrationPath}`);
  console.log(`  Full text (${narration.fullText.length} chars):`);
  console.log(`  "${narration.fullText.substring(0, 150)}..."`);
}

// ═══════════════════════════════════════════════════════════════════════
// Step 5: TTS audio generation
// ═══════════════════════════════════════════════════════════════════════
console.log("\n══════════════════════════════════════════");
console.log("STEP 5: TTS audio generation");
console.log("══════════════════════════════════════════\n");

const narrationAudioPath = join(outputDir, "narration.mp3");

if (skipNarration && existsSync(narrationAudioPath)) {
  console.log("  Skipping TTS (--skip-narration, audio exists)");
} else {
  console.log(`  Provider: ${ttsProvider}`);
  console.log(`  Text: ${narration.fullText.length} chars`);

  try {
    const { generateSpeech } = await import(join(ROOT, "lib", "tts", "index.js"));
    const result = await generateSpeech(narration.fullText, {
      provider: ttsProvider,
      outputPath: narrationAudioPath,
    });
    console.log(`  Audio generated: ${narrationAudioPath} (${result.duration.toFixed(1)}s)`);
  } catch (err) {
    console.error(`  TTS failed: ${err.message}`);

    // Fallback: try edge-tts CLI directly
    console.log("  Falling back to edge-tts CLI...");
    try {
      const textFile = join(outputDir, "narration-input.txt");
      writeFileSync(textFile, narration.fullText);
      execSync(
        `edge-tts --voice "en-US-GuyNeural" --rate="-10%" --file "${textFile}" --write-media "${narrationAudioPath}"`,
        { timeout: 120000, stdio: "pipe" }
      );
      console.log(`  Audio generated via edge-tts CLI: ${narrationAudioPath}`);
    } catch (err2) {
      console.error(`  Edge TTS fallback also failed: ${err2.message}`);
      console.error("  Install edge-tts: pip install edge-tts");
      process.exit(1);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Step 6: Whisper word-level timing
// ═══════════════════════════════════════════════════════════════════════
console.log("\n══════════════════════════════════════════");
console.log("STEP 6: Whisper word-level timing");
console.log("══════════════════════════════════════════\n");

const wordTimingsPath = join(outputDir, "word-timings.json");
let wordTimings = [];

try {
  console.log(`  Model: ${whisperModel}`);
  console.log("  Transcribing...");

  // Try whisperx forced alignment first (perfect word timing), fall back to basic whisper
  const { forcedAlignWordTimings, transcribeAudio } = await import(join(ROOT, "lib", "whisper.mjs"));
  try {
    console.log("  Attempting whisperx forced alignment...");
    wordTimings = await forcedAlignWordTimings(narrationAudioPath, wordTimingsPath, { model: whisperModel });
  } catch (err) {
    console.log(`  Forced alignment unavailable: ${err.message}`);
    console.log("  Falling back to basic whisper...");
    const result = await transcribeAudio(narrationAudioPath, { model: whisperModel });
    wordTimings = result.wordTimings;
    writeFileSync(wordTimingsPath, JSON.stringify(wordTimings, null, 2));
  }
  console.log(`  ${wordTimings.length} words with timing data`);
  if (wordTimings.length > 0) {
    console.log(`  Span: ${wordTimings[0].startMs}ms - ${wordTimings[wordTimings.length - 1].endMs}ms`);
  }
} catch (err) {
  console.error(`  Whisper failed: ${err.message}`);
  console.log("  Falling back to estimated timings...");

  const audioDur = getAudioDuration(narrationAudioPath);
  wordTimings = estimateWordTimings(narration.fullText, audioDur);
  writeFileSync(wordTimingsPath, JSON.stringify(wordTimings, null, 2));
  console.log(`  ${wordTimings.length} words (estimated)`);
}

// ═══════════════════════════════════════════════════════════════════════
// Step 6b: Narration-driven video edit (deferred from Step 2)
// ═══════════════════════════════════════════════════════════════════════

if (editDeferred) {
  console.log("\n══════════════════════════════════════════");
  console.log("STEP 6b: Narration-driven video edit");
  console.log("══════════════════════════════════════════\n");

  try {
    const { buildNarrationDrivenEditList, editVideo } = await import(join(ROOT, "lib", "video-editor.mjs"));

    // Build narration placements from: narration segments + word timings + timeline
    // Each narration segment maps to a time range in the raw video (via timeline)
    // and has an audio duration (via word timings or estimation).
    const narrationPlacements = buildNarrationPlacements(narration, wordTimings, timeline, rawDurationSec);

    if (narrationPlacements.length > 0) {
      console.log(`  ${narrationPlacements.length} narration placements built`);

      console.log("  Building narration-driven edit list...");
      const editList = buildNarrationDrivenEditList(timeline, narrationPlacements, rawDurationSec);
      console.log(`  ${editList.length} edit segments`);

      // Save edit list for debugging
      writeFileSync(join(outputDir, "narration-edit-list.json"), JSON.stringify(editList, null, 2));

      console.log("  Applying narration-driven edits...");
      editVideo(absRecording, editList, editedPath);
      console.log(`  Narration-driven video: ${editedPath}`);

      // Re-probe the edited duration
      probeEditedDuration();
    } else {
      console.log("  ⚠️  Could not build narration placements — keeping raw video");
      console.log("     (narration segments may not map to timeline actions)");
    }
  } catch (err) {
    console.error(`  Narration-driven edit failed: ${err.message}`);
    console.error(err.stack);
    console.log("  Falling back to raw video (already copied in Step 2)");
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Step 7: Assemble Remotion props
// ═══════════════════════════════════════════════════════════════════════
console.log("\n══════════════════════════════════════════");
console.log("STEP 7: Assemble Remotion props");
console.log("══════════════════════════════════════════\n");

const publicDir = join(ROOT, "demo-render", "public");
mkdirSync(publicDir, { recursive: true });

// Copy assets to demo-render/public/
const publicScreen = join(publicDir, "screen.mp4");
const publicNarration = join(publicDir, "narration.mp3");
const publicWordTimings = join(publicDir, "word-timings.json");

// Mux narration audio into the edited video — MarketingDemo plays audio from the video file
const screenWithNarration = join(outputDir, "edited-with-narration.mp4");
try {
  execSync(
    `ffmpeg -i "${editedPath}" -i "${narrationAudioPath}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest -y "${screenWithNarration}"`,
    { stdio: "pipe", timeout: 60000 }
  );
  copyFileSync(screenWithNarration, publicScreen);
  console.log(`  Muxed narration audio into video → public/screen.mp4`);
} catch (muxErr) {
  // Fallback: add silent audio track (Remotion still needs an audio track)
  console.warn(`  Narration mux failed: ${muxErr.message}`);
  try {
    execSync(
      `ffmpeg -i "${editedPath}" -f lavfi -i anullsrc=r=44100:cl=stereo -c:v copy -c:a aac -shortest -y "${screenWithNarration}"`,
      { stdio: "pipe", timeout: 60000 }
    );
    copyFileSync(screenWithNarration, publicScreen);
    console.log(`  Copied edited video (with silent audio) to public/screen.mp4`);
  } catch {
    copyFileSync(editedPath, publicScreen);
    console.log(`  Copied edited video to public/screen.mp4 (no audio)`);
  }
}

copyFileSync(narrationAudioPath, publicNarration);
console.log(`  Copied narration to public/narration.mp3`);

copyFileSync(wordTimingsPath, publicWordTimings);
console.log(`  Copied word timings to public/word-timings.json`);

const introDurationFrames = 90; // 3 seconds
const outroDurationFrames = 90; // 3 seconds
const transitionDurationFrames = 0;

// Derive intro/outro text from narration or CLI flags
const introTagline = parseFlag("intro-tagline") || narration.introTagline || narration.segments?.[0]?.text?.substring(0, 60) || "Product Demo";
const introSubtitle = parseFlag("intro-subtitle") || narration.introSubtitle || "";
const outroHeading = parseFlag("outro-heading") || narration.outroHeading || "Thanks for watching";
const outroUrl = parseFlag("outro-url") || narration.outroUrl || "";
const outroCtaText = parseFlag("outro-cta") || narration.outroCtaText || "";
const accentColor = parseFlag("accent-color") || narration.accentColor || undefined;

const props = {
  wordTimings,
  lowerThirds: [],
  zoomRegions: [],
  callouts: [],
  showAvatar: false,
  showPresenter: false,
  mouthCues: [],
  audioVolume: 1.3,
  introDurationFrames,
  transitionDurationFrames,
  videoDurationFrames: editedDurationFrames,
  outroDurationFrames,
  // Custom intro/outro
  introTagline,
  introSubtitle,
  outroHeading,
  outroUrl,
  outroCtaText,
  accentColor,
  displayUrl: outroUrl || narration.displayUrl || "",
};

// Generate lower thirds from narration segments if available
if (narration.segments && narration.segments.length > 1) {
  // Distribute lower thirds across the video duration
  const segmentCount = narration.segments.length;
  const audioDur = getAudioDuration(narrationAudioPath);
  const segDurationSec = audioDur / segmentCount;

  for (let i = 0; i < narration.segments.length; i++) {
    const seg = narration.segments[i];
    // Try to find the segment's start time from word timings
    const segStartSec = findSegmentStartTime(seg.text, wordTimings, i * segDurationSec);
    if (seg.sceneLabel) {
      props.lowerThirds.push({
        label: seg.sceneLabel,
        startFrame: Math.round(segStartSec * FPS),
        durationFrames: Math.round(4 * FPS), // 4 seconds
      });
    }
  }
  if (props.lowerThirds.length > 0) {
    console.log(`  ${props.lowerThirds.length} lower thirds generated`);
  }
}

const propsPath = join(outputDir, "screencast-props.json");
writeFileSync(propsPath, JSON.stringify(props, null, 2));

// Also copy to demo-render/public for Remotion access
const publicPropsPath = join(publicDir, "screencast-props.json");
writeFileSync(publicPropsPath, JSON.stringify(props, null, 2));

const totalFrames = introDurationFrames + transitionDurationFrames + editedDurationFrames + outroDurationFrames;
console.log(`  Props written: ${propsPath}`);
console.log(`  Total duration: ${(totalFrames / FPS).toFixed(1)}s (${totalFrames} frames)`);
console.log(`    Intro: ${introDurationFrames} frames (${(introDurationFrames / FPS).toFixed(1)}s)`);
console.log(`    Video: ${editedDurationFrames} frames (${(editedDurationFrames / FPS).toFixed(1)}s)`);
console.log(`    Outro: ${outroDurationFrames} frames (${(outroDurationFrames / FPS).toFixed(1)}s)`);

// ═══════════════════════════════════════════════════════════════════════
// Step 8: Remotion render
// ═══════════════════════════════════════════════════════════════════════
console.log("\n══════════════════════════════════════════");
console.log("STEP 8: Render with Remotion");
console.log("══════════════════════════════════════════\n");

const finalDir = join(ROOT, "final-output");
mkdirSync(finalDir, { recursive: true });
const finalOutput = join(finalDir, `${outputName}-final.mp4`);

console.log(`  Composition: MarketingDemo`);
console.log(`  Output: ${finalOutput}`);

try {
  // Write props to file to avoid shell escaping issues with inline JSON
  const renderPropsPath = join(publicDir, "screencast-props.json");

  console.log("  Rendering...");
  const result = spawnSync("npx", [
    "remotion", "render",
    "src/index.ts", "MarketingDemo",
    `--props=${renderPropsPath}`,
    `--output=${finalOutput}`,
    "--codec=h264",
    "--image-format=jpeg",
    "--jpeg-quality=90",
    "--width=1920",
    "--height=1080",
  ], {
    stdio: "inherit",
    timeout: 600000,
    cwd: join(ROOT, "demo-render"),
  });

  if (result.status !== 0) {
    throw new Error(`Remotion exited with code ${result.status}`);
  }
  console.log(`\n  Video rendered: ${finalOutput}`);
} catch (err) {
  console.error(`  Render failed: ${err.message}`);
  console.log("\n  Try previewing first: cd demo-render && npx remotion studio");
  console.log(`  Props file: ${publicPropsPath}`);
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════
// Step 9: Summary
// ═══════════════════════════════════════════════════════════════════════
console.log("\n══════════════════════════════════════════");
console.log("DONE");
console.log("══════════════════════════════════════════\n");

const finalStats = statSync(finalOutput);
const fileSizeMB = (finalStats.size / 1024 / 1024).toFixed(1);

console.log(`  Output: ${finalOutput}`);
console.log(`  Size: ${fileSizeMB} MB`);
console.log(`  Duration: ${(totalFrames / FPS).toFixed(1)}s`);
console.log(`  Edited from: ${rawDurationSec.toFixed(1)}s → ${editedDurationSec.toFixed(1)}s`);
console.log(`  Narration: ${narration.fullText.length} chars, ${wordTimings.length} words`);
console.log(`  TTS: ${ttsProvider}, Whisper: ${whisperModel}`);
console.log("");

// ═══════════════════════════════════════════════════════════════════════
// Helper functions
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate narration from scene hints.
 * Uses Claude API if available, otherwise falls back to template generation.
 */
async function generateNarration(hints) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (apiKey) {
    try {
      return await generateNarrationWithClaude(hints, apiKey);
    } catch (err) {
      console.error(`  Claude API failed: ${err.message}`);
      console.log("  Falling back to template narration");
    }
  } else {
    console.log("  ANTHROPIC_API_KEY not set — using template narration");
  }

  return generateNarrationFromTemplate(hints);
}

/**
 * Generate narration using Claude API.
 */
async function generateNarrationWithClaude(hints, apiKey) {
  const sceneDescriptions = hints.map((h, i) =>
    `Scene ${i + 1}: ${h.actions.join(". ")}`
  ).join("\n");

  const prompt = `Write a concise, engaging narration for a product demo video. Here are the scenes and actions:

${sceneDescriptions}

Write 1-2 sentences per scene. Be conversational, not robotic. Focus on what the USER is doing, not technical details. Use "we" or "let's" perspective. Start with a brief intro and end with a wrap-up.

Return a JSON object with:
- "segments": array of { "text": string, "sceneIndex": number, "sceneLabel": string|null } for each scene
  - sceneLabel: a short 2-4 word label for the scene (for lower thirds), or null for intro/outro
- "fullText": all segments joined as one continuous narration`;

  console.log("  Calling Claude API for narration...");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2000,
      messages: [
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error ${response.status}: ${error}`);
  }

  const data = await response.json();
  const text = data.content[0].text;

  // Extract JSON from response (may be wrapped in markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Could not parse Claude response as JSON");
  }

  const result = JSON.parse(jsonMatch[0]);

  // Ensure fullText exists
  if (!result.fullText && result.segments) {
    result.fullText = result.segments.map((s) => s.text).join(" ");
  }

  console.log(`  Claude generated ${result.segments?.length || 0} segments`);
  return result;
}

/**
 * Generate placeholder narration (offline, no API).
 *
 * This produces a narration-hints.json that Claude (in the conversation)
 * should use to write proper narration into narration.json before running
 * the pipeline with --skip-narration.
 *
 * The template output is intentionally minimal — just enough to test the
 * pipeline end-to-end, not for production use.
 */
function generateNarrationFromTemplate(hints) {
  console.log("  ⚠️  Template narration is a placeholder only.");
  console.log("     For quality narration, either:");
  console.log("     1. Set ANTHROPIC_API_KEY in .env");
  console.log("     2. Write narration.json by hand, then re-run with --skip-narration");
  console.log("     3. Ask Claude in the conversation to write it from the hints");
  console.log("");

  // Build a simple summary narration from the hints
  const segments = [];

  segments.push({
    text: "Here's a quick walkthrough of the app.",
    sceneIndex: -1,
    sceneLabel: null,
  });

  for (const hint of hints) {
    // Extract meaningful fill values for context
    const fills = hint.actions
      .filter((a) => a.startsWith("Type '"))
      .map((a) => {
        const match = a.match(/^Type '([^']+)'/);
        return match ? match[1] : null;
      })
      .filter(Boolean);

    const hasClicks = hint.actions.some((a) => a.startsWith("Click"));
    const hasLoads = hint.actions.some((a) => a.includes("[page loads]"));

    let text;
    if (fills.length > 0 && hasClicks) {
      text = `We fill in the form and continue.`;
    } else if (hasClicks) {
      text = `We select an option and proceed.`;
    } else if (hasLoads) {
      text = `The page loads with the result.`;
    } else {
      text = `Moving to the next step.`;
    }

    segments.push({
      text,
      sceneIndex: hint.sceneIndex,
      sceneLabel: null,
    });
  }

  segments.push({
    text: "And that's it — quick and easy.",
    sceneIndex: -1,
    sceneLabel: null,
  });

  const fullText = segments.map((s) => s.text).join(" ");
  return { segments, fullText };
}

/**
 * Find the start time of a narration segment in word timings
 * by matching the first few words.
 */
function findSegmentStartTime(text, wordTimings, fallbackSec) {
  if (!wordTimings || wordTimings.length === 0) return fallbackSec;

  const normalize = (w) => w.toLowerCase().replace(/[.,!?;:'"()\-]/g, "").trim();
  const targetWords = text.split(/\s+/).slice(0, 4).map(normalize).filter(Boolean);

  if (targetWords.length < 2) return fallbackSec;

  const matchLen = Math.min(targetWords.length, 3);
  for (let i = 0; i < wordTimings.length - matchLen; i++) {
    let matched = 0;
    for (let k = 0; k < matchLen; k++) {
      const actual = normalize(wordTimings[i + k].text);
      if (actual.substring(0, 3) === targetWords[k].substring(0, 3)) {
        matched++;
      }
    }
    if (matched >= matchLen - 1) {
      return wordTimings[i].startMs / 1000;
    }
  }

  return fallbackSec;
}

/**
 * Get audio duration in seconds via ffprobe.
 */
function getAudioDuration(audioPath) {
  if (!existsSync(audioPath)) return 60;
  try {
    const result = execSync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${audioPath}"`,
      { encoding: "utf8", timeout: 10000 }
    ).trim();
    return parseFloat(result) || 60;
  } catch {
    return 60;
  }
}

/**
 * Estimate word timings from text and total duration (fallback if Whisper fails).
 */
function estimateWordTimings(text, totalDurationSec) {
  const words = text.split(/\s+/).filter(Boolean);
  const msPerWord = (totalDurationSec * 1000) / words.length;
  return words.map((word, i) => ({
    text: word,
    startMs: Math.round(i * msPerWord),
    endMs: Math.round((i + 1) * msPerWord),
  }));
}

/**
 * Parse a --flag value from CLI args.
 */
function parseFlag(name) {
  const flag = args.find((a) => a.startsWith(`--${name}`));
  if (!flag) return null;
  if (flag.includes("=")) return flag.split("=").slice(1).join("=");
  const idx = args.indexOf(flag);
  return args[idx + 1] && !args[idx + 1].startsWith("--") ? args[idx + 1] : "";
}

/**
 * Build narration placements that map each narration segment to a raw video time range
 * and the segment's spoken audio duration.
 *
 * Strategy:
 *   1. Each narration segment corresponds to a "scene" in the timeline (group of actions).
 *   2. The scene's video time range comes from the timeline segments' startMs/endMs.
 *   3. The narration segment's audio duration comes from word timings (finding where
 *      the segment's text starts and ends in the Whisper output).
 *
 * If narration segments don't have explicit sceneIndex mapping, we distribute them
 * proportionally across the raw video duration.
 *
 * @param {object} narration - { segments: [{ text, sceneIndex }], fullText }
 * @param {object[]} wordTimings - [{ text, startMs, endMs }]
 * @param {object[]} timelineSegments - from parseTimeline()
 * @param {number} rawDurationSec - total raw video duration
 * @returns {{ videoStartSec: number, videoEndSec: number, narrationDurationSec: number }[]}
 */
function buildNarrationPlacements(narration, wordTimings, timelineSegments, rawDurationSec) {
  if (!narration?.segments || narration.segments.length === 0) {
    return [];
  }

  const segments = narration.segments;

  // --- Compute each narration segment's audio duration from word timings ---
  const totalAudioDurationMs = wordTimings.length > 0
    ? wordTimings[wordTimings.length - 1].endMs
    : 0;

  // Find audio start/end for each narration segment by matching its text
  // against the word timings sequence
  const segmentAudioRanges = findSegmentAudioRanges(segments, wordTimings, totalAudioDurationMs);

  // --- Map each narration segment to a raw video time range ---
  // Group timeline segments into scenes (separated by navigation/loading boundaries)
  const scenes = groupTimelineIntoScenes(timelineSegments);

  const placements = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const audioRange = segmentAudioRanges[i];
    const narrationDurationSec = (audioRange.endMs - audioRange.startMs) / 1000;

    if (narrationDurationSec <= 0.05) continue; // skip near-zero segments

    // Determine raw video time range for this segment
    let videoStartSec, videoEndSec;

    const sceneIdx = seg.sceneIndex;

    // Explicit video timestamps override everything (for manually mapped segments like scroll footage)
    if (seg.videoStartSec != null && seg.videoEndSec != null) {
      videoStartSec = seg.videoStartSec;
      videoEndSec = seg.videoEndSec;
    } else if (sceneIdx != null && sceneIdx >= 0 && sceneIdx < scenes.length) {
      // Direct scene mapping from narration segment
      videoStartSec = scenes[sceneIdx].startMs / 1000;
      videoEndSec = scenes[sceneIdx].endMs / 1000;
    } else if (scenes.length > 0 && segments.filter(s => s.sceneIndex >= 0 && s.sceneIndex < scenes.length).length === 0) {
      // No valid scene indices at all — distribute proportionally across video
      const narrationSegCount = segments.length;
      const segDuration = rawDurationSec / narrationSegCount;
      videoStartSec = i * segDuration;
      videoEndSec = (i + 1) * segDuration;
    } else {
      // This segment doesn't map to a scene (intro/outro with sceneIndex=-1).
      // Assign it to the gap before the first scene or after the last scene.
      if (i === 0 && scenes.length > 0) {
        // Intro: before first scene
        videoStartSec = 0;
        videoEndSec = Math.min(scenes[0].startMs / 1000, rawDurationSec);
        // If there's no gap before first scene, share the first scene's range
        if (videoEndSec - videoStartSec < 0.1 && scenes.length > 0) {
          videoEndSec = scenes[0].endMs / 1000;
        }
      } else if (i === segments.length - 1 && scenes.length > 0) {
        // Outro: after last scene
        const lastScene = scenes[scenes.length - 1];
        videoStartSec = lastScene.endMs / 1000;
        videoEndSec = rawDurationSec;
        // If there's no gap after last scene, share the last scene's range
        if (videoEndSec - videoStartSec < 0.1) {
          videoStartSec = lastScene.startMs / 1000;
        }
      } else {
        // Middle segment without scene mapping — distribute proportionally
        const narrationSegCount = segments.length;
        const segDuration = rawDurationSec / narrationSegCount;
        videoStartSec = i * segDuration;
        videoEndSec = (i + 1) * segDuration;
      }
    }

    // Ensure valid range
    videoStartSec = Math.max(0, Math.min(videoStartSec, rawDurationSec));
    videoEndSec = Math.max(videoStartSec + 0.01, Math.min(videoEndSec, rawDurationSec));

    placements.push({
      videoStartSec,
      videoEndSec,
      narrationDurationSec,
    });
  }

  return placements;
}

/**
 * Find the audio time range (startMs, endMs) for each narration segment
 * by matching segment text against word timings.
 *
 * Uses a greedy forward scan: for each segment, find where its first words
 * appear in the word timings sequence (starting from where the previous
 * segment ended).
 */
function findSegmentAudioRanges(segments, wordTimings, totalAudioDurationMs) {
  if (wordTimings.length === 0) {
    // No word timings — estimate proportionally from text length
    const totalChars = segments.reduce((sum, s) => sum + (s.text?.length || 0), 0);
    let offsetMs = 0;
    return segments.map((seg) => {
      const chars = seg.text?.length || 0;
      const durationMs = totalChars > 0 ? (chars / totalChars) * totalAudioDurationMs : 0;
      const range = { startMs: offsetMs, endMs: offsetMs + durationMs };
      offsetMs += durationMs;
      return range;
    });
  }

  const normalize = (w) => w.toLowerCase().replace(/[.,!?;:'"()\-]/g, "").trim();
  const results = [];
  let searchStart = 0; // word index to start searching from

  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];
    const segText = seg.text || "";
    const segWords = segText.split(/\s+/).map(normalize).filter(Boolean);

    if (segWords.length === 0) {
      // Empty segment — give it zero duration at current position
      const currentMs = searchStart < wordTimings.length ? wordTimings[searchStart].startMs : totalAudioDurationMs;
      results.push({ startMs: currentMs, endMs: currentMs });
      continue;
    }

    // Find the start of this segment in word timings
    const matchLen = Math.min(segWords.length, 4);
    const requiredMatches = Math.max(1, matchLen - 1);
    let foundStart = -1;

    for (let wi = searchStart; wi <= wordTimings.length - matchLen; wi++) {
      let matched = 0;
      for (let k = 0; k < matchLen; k++) {
        const actual = normalize(wordTimings[wi + k].text);
        // Prefix match (at least 3 chars) to handle slight transcription differences
        const minLen = Math.min(3, segWords[k].length, actual.length);
        if (actual.substring(0, minLen) === segWords[k].substring(0, minLen)) {
          matched++;
        }
      }
      if (matched >= requiredMatches) {
        foundStart = wi;
        break;
      }
    }

    if (foundStart === -1) {
      // Could not find a match — estimate position based on text proportion
      // This segment gets proportional share of remaining audio
      const remainingSegments = segments.length - si;
      const remainingMs = totalAudioDurationMs - (searchStart < wordTimings.length ? wordTimings[searchStart].startMs : totalAudioDurationMs);
      const estimatedDuration = remainingMs / remainingSegments;
      const startMs = searchStart < wordTimings.length ? wordTimings[searchStart].startMs : totalAudioDurationMs;
      results.push({ startMs, endMs: startMs + Math.max(0, estimatedDuration) });
      // Advance search start proportionally by estimated word count
      const avgWordsPerSeg = Math.ceil(wordTimings.length / segments.length);
      searchStart = Math.min(searchStart + avgWordsPerSeg, wordTimings.length);
      continue;
    }

    const startMs = wordTimings[foundStart].startMs;

    // Find the end: either the start of the next segment or estimate from word count
    // Count how many words this segment likely covers
    const segWordCount = segWords.length;
    const endWordIdx = Math.min(foundStart + segWordCount, wordTimings.length) - 1;
    const endMs = wordTimings[endWordIdx].endMs;

    results.push({ startMs, endMs });
    searchStart = endWordIdx + 1;
  }

  return results;
}

/**
 * Group timeline segments into scenes.
 * A scene is a contiguous group of actions separated by navigation/loading events.
 * Returns an array of { startMs, endMs } representing each scene's video time range.
 */
function groupTimelineIntoScenes(timelineSegments) {
  if (timelineSegments.length === 0) return [];

  const SCENE_BREAK_TOOLS = new Set(["navigate_page", "navigate", "navigation", "wait_for"]);
  const SCENE_BREAK_CLASSIFICATIONS = new Set(["loading", "navigation"]);

  const scenes = [];
  let currentScene = null;

  for (const seg of timelineSegments) {
    const isBreak = SCENE_BREAK_TOOLS.has(seg.tool) || SCENE_BREAK_CLASSIFICATIONS.has(seg.classification);

    if (isBreak) {
      // Close current scene if it exists
      if (currentScene) {
        scenes.push(currentScene);
        currentScene = null;
      }
      // Navigation/loading events are not part of any scene (they become gaps)
      continue;
    }

    if (!currentScene) {
      currentScene = { startMs: seg.startMs, endMs: seg.endMs };
    } else {
      currentScene.endMs = Math.max(currentScene.endMs, seg.endMs);
    }
  }

  if (currentScene) {
    scenes.push(currentScene);
  }

  return scenes;
}
