#!/usr/bin/env node

/**
 * Pitch Video Pipeline
 *
 * Generates a narrated pitch video from a structured script:
 *   1. Parse scene script (markdown with narration + visual prompts)
 *   2. Generate images for each scene via OpenAI GPT Image 1.5
 *   3. Generate TTS narration via Edge TTS
 *   4. Whisper word-level timing
 *   5. Build ScoutReplay props (scenes = generated images, no cursor actions)
 *   6. Render with Remotion
 *
 * Usage:
 *   node scripts/pitch-video-pipeline.mjs scripts/gas-gang-drizzle-pitch.md
 *   node scripts/pitch-video-pipeline.mjs scripts/gas-gang-drizzle-pitch.md --skip-images
 *   node scripts/pitch-video-pipeline.mjs scripts/gas-gang-drizzle-pitch.md --skip-tts
 *   node scripts/pitch-video-pipeline.mjs scripts/gas-gang-drizzle-pitch.md --render-only
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from "fs";
import { join, dirname, resolve, basename } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
dotenv.config({ path: join(ROOT, ".env") });

const FPS = 30;
const VIEWPORT = { width: 1920, height: 1080 };

// ═══════════════════════════════════════════════════════════════════════
// Parse CLI args
// ═══════════════════════════════════════════════════════════════════════
const args = process.argv.slice(2);
const scriptPath = args.find((a) => !a.startsWith("--"));
const skipImages = args.includes("--skip-images");
const skipTts = args.includes("--skip-tts");
const renderOnly = args.includes("--render-only");
const draftMode = args.includes("--draft");

if (!scriptPath) {
  console.error("Usage: node scripts/pitch-video-pipeline.mjs <script.md> [--skip-images] [--skip-tts] [--render-only] [--draft]");
  process.exit(1);
}

const absScript = resolve(scriptPath);
if (!existsSync(absScript)) {
  console.error(`Script not found: ${absScript}`);
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════
// Output directories
// ═══════════════════════════════════════════════════════════════════════
const outputDir = join(ROOT, "pitch-output");
const imagesDir = join(outputDir, "images");
const audioDir = join(outputDir, "audio");
const publicDir = join(ROOT, "demo-render", "public");
const publicScreenshots = join(publicDir, "screenshots");

for (const dir of [outputDir, imagesDir, audioDir, publicScreenshots]) {
  mkdirSync(dir, { recursive: true });
}

// ═══════════════════════════════════════════════════════════════════════
// Step 1: Parse the script markdown
// ═══════════════════════════════════════════════════════════════════════
console.log("\n══════════════════════════════════════════");
console.log("STEP 1: Parsing script");
console.log("══════════════════════════════════════════\n");

const scriptContent = readFileSync(absScript, "utf8");
const scenes = parseScript(scriptContent);

console.log(`Parsed ${scenes.length} scenes:`);
for (const scene of scenes) {
  const narrationPreview = scene.narration.substring(0, 60).replace(/\n/g, " ");
  console.log(`  ${scene.id}. ${scene.title} (${scene.targetDurationSec}s) — "${narrationPreview}..."`);
}

// ═══════════════════════════════════════════════════════════════════════
// Step 2: Generate images via OpenAI GPT Image 1.5
// ═══════════════════════════════════════════════════════════════════════
if (!skipImages && !renderOnly) {
  console.log("\n══════════════════════════════════════════");
  console.log("STEP 2: Generating images (GPT Image 1.5)");
  console.log("══════════════════════════════════════════\n");

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY not set in .env");
    process.exit(1);
  }

  for (const scene of scenes) {
    const imagePath = join(imagesDir, `scene-${scene.id}.png`);

    if (existsSync(imagePath)) {
      console.log(`  [skip] Scene ${scene.id} image exists: ${basename(imagePath)}`);
      continue;
    }

    console.log(`  [gen] Scene ${scene.id}: ${scene.title}`);
    console.log(`        Prompt: ${scene.imagePrompt.substring(0, 100)}...`);

    try {
      await generateImage(apiKey, scene.imagePrompt, imagePath);
      console.log(`        ✓ Saved: ${basename(imagePath)}`);
    } catch (err) {
      console.error(`        ✗ Failed: ${err.message}`);
      // Create a placeholder black image so pipeline continues
      createPlaceholderImage(imagePath, scene.title);
      console.log(`        → Created placeholder`);
    }

    // Rate limit: 5 IPM on tier 1
    if (scene.id < scenes.length) {
      console.log(`        Waiting 15s (rate limit)...`);
      await sleep(15000);
    }
  }
} else {
  console.log("\n[skip] Image generation (--skip-images or --render-only)");
}

// ═══════════════════════════════════════════════════════════════════════
// Step 3: Generate TTS narration
// ═══════════════════════════════════════════════════════════════════════
const fullNarration = scenes.map((s) => s.narration).join("\n\n");
const narrationPath = join(audioDir, "full-narration.mp3");

if (!skipTts && !renderOnly) {
  console.log("\n══════════════════════════════════════════");
  console.log("STEP 3: Generating TTS narration");
  console.log("══════════════════════════════════════════\n");

  // Write narration text file
  const narrationTextPath = join(audioDir, "narration.txt");
  writeFileSync(narrationTextPath, fullNarration);
  console.log(`  Narration text: ${fullNarration.length} chars`);

  const useElevenLabs = !!process.env.ELEVENLABS_API_KEY && !draftMode;

  if (useElevenLabs) {
    console.log("  Provider: ElevenLabs (premium)");
    try {
      const { generateSpeech } = await import(join(ROOT, "lib", "tts", "index.js"));
      const result = await generateSpeech(fullNarration, {
        provider: "elevenlabs",
        outputPath: narrationPath,
        voice: process.env.ELEVENLABS_VOICE_ID || undefined,
      });
      console.log(`  ✓ Audio: ${basename(narrationPath)} (${result.duration.toFixed(1)}s)`);
    } catch (err) {
      console.error(`  ✗ ElevenLabs failed: ${err.message}`);
      console.log("  Falling back to Edge TTS...");
      await generateEdgeTts(fullNarration, narrationPath, audioDir);
    }
  } else {
    console.log("  Provider: Edge TTS (free)");
    await generateEdgeTts(fullNarration, narrationPath, audioDir);
  }
} else {
  console.log("\n[skip] TTS generation (--skip-tts or --render-only)");
}

// ═══════════════════════════════════════════════════════════════════════
// Step 4: Whisper word-level timing
// ═══════════════════════════════════════════════════════════════════════
const wordTimingsPath = join(audioDir, "word-timings.json");

if (!renderOnly) {
  console.log("\n══════════════════════════════════════════");
  console.log("STEP 4: Whisper word-level transcription");
  console.log("══════════════════════════════════════════\n");

  if (!existsSync(narrationPath)) {
    console.error(`  Narration audio not found: ${narrationPath}`);
    process.exit(1);
  }

  try {
    // Import whisper module from AutoDemo
    const { transcribeAudio } = await import(join(ROOT, "lib", "whisper.mjs"));
    const model = draftMode ? "small.en" : "medium.en";
    console.log(`  Model: ${model}`);
    console.log(`  Transcribing...`);

    const result = await transcribeAudio(narrationPath, { model });
    writeFileSync(wordTimingsPath, JSON.stringify(result.wordTimings, null, 2));
    console.log(`  ✓ ${result.wordTimings.length} words transcribed`);
  } catch (err) {
    console.error(`  ✗ Whisper failed: ${err.message}`);
    console.log("  Falling back to estimated timings from VTT...");
    const estimatedTimings = estimateWordTimings(fullNarration, getAudioDuration(narrationPath));
    writeFileSync(wordTimingsPath, JSON.stringify(estimatedTimings, null, 2));
    console.log(`  ✓ ${estimatedTimings.length} words (estimated)`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Step 5: Build ScoutReplay props
// ═══════════════════════════════════════════════════════════════════════
console.log("\n══════════════════════════════════════════");
console.log("STEP 5: Building Remotion props");
console.log("══════════════════════════════════════════\n");

// Copy images to demo-render/public/screenshots/
for (const scene of scenes) {
  const src = join(imagesDir, `scene-${scene.id}.png`);
  const dest = join(publicScreenshots, `scene-${scene.id}.png`);
  if (existsSync(src)) {
    copyFileSync(src, dest);
  }
}
console.log(`  Copied ${scenes.length} images to public/screenshots/`);

// Copy audio to demo-render/public/
const publicAudio = join(publicDir, "pitch-narration.mp3");
if (existsSync(narrationPath)) {
  copyFileSync(narrationPath, publicAudio);
  console.log(`  Copied narration to public/pitch-narration.mp3`);
}

// Load word timings
let wordTimings = [];
if (existsSync(wordTimingsPath)) {
  wordTimings = JSON.parse(readFileSync(wordTimingsPath, "utf8"));
}

// Get audio duration
const audioDurationSec = getAudioDuration(narrationPath);
console.log(`  Audio duration: ${audioDurationSec.toFixed(1)}s`);

// Sync scene timing to actual Whisper word timings.
// For each scene, find where its narration starts in the audio by matching
// the first few words of the scene text against the transcribed words.
const sceneBoundaries = syncScenesToWordTimings(scenes, wordTimings, audioDurationSec);

const remotionScenes = sceneBoundaries.map((boundary, i) => {
  const scene = scenes[i];
  const durationMs = boundary.endMs - boundary.startMs;
  // Add padding to the last scene so audio doesn't get clipped by outro transition
  const isLast = i === scenes.length - 1;
  const paddingFrames = isLast ? FPS * 3 : 0;
  const durationFrames = Math.max(Math.round((durationMs / 1000) * FPS), FPS * 3) + paddingFrames;

  return {
    screenshotBefore: `screenshots/scene-${scene.id}.png`,
    screenshotAfter: i < scenes.length - 1
      ? `screenshots/scene-${scenes[i + 1].id}.png`
      : `screenshots/scene-${scene.id}.png`,
    actions: [],
    durationFrames,
    lowerThird: scene.lowerThird || null,
    autoZoom: false,
    audioOffsetMs: Math.round(boundary.startMs),
  };
});

const props = {
  scenes: remotionScenes,
  wordTimings,
  captionStyle: "pop",
  showAvatar: false,
  audioVolume: 1.3,
  introDurationFrames: FPS * 4, // 4 second intro
  outroDurationFrames: FPS * 4, // 4 second outro
  audioSrc: "pitch-narration.mp3",
};

const propsPath = join(outputDir, "pitch-props.json");
writeFileSync(propsPath, JSON.stringify(props, null, 2));
console.log(`  ✓ Props written: ${propsPath}`);

// Also copy to demo-render/public for Remotion access
const publicPropsPath = join(publicDir, "pitch-props.json");
writeFileSync(publicPropsPath, JSON.stringify(props, null, 2));

// ═══════════════════════════════════════════════════════════════════════
// Step 5b: Timeline Audit (verify scene/audio alignment before render)
// ═══════════════════════════════════════════════════════════════════════
console.log("\n══════════════════════════════════════════");
console.log("STEP 5b: Timeline Audit");
console.log("══════════════════════════════════════════\n");

const auditResult = runTimelineAudit(props, scenes);
const auditPath = propsPath.replace(/\.json$/, "-timeline-audit.json");
writeFileSync(auditPath, JSON.stringify(auditResult, null, 2));

if (auditResult.issues.length > 0) {
  console.log(`  ⚠ ${auditResult.issues.length} issue(s) found:`);
  for (const issue of auditResult.issues) {
    console.log(`    - ${issue}`);
  }
  console.log("");
} else {
  console.log("  ✓ No alignment issues detected");
}

// Print compact timeline
for (const scene of auditResult.scenes) {
  const img = scene.imageBefore === scene.imageAfter
    ? scene.imageBefore.replace("screenshots/", "")
    : `${scene.imageBefore.replace("screenshots/", "")} → ${scene.imageAfter.replace("screenshots/", "")}`;
  console.log(`  Scene ${scene.id} [${scene.startSec}s-${scene.endSec}s] ${img}`);
  console.log(`    "${scene.narrationPreview}"`);
}

// ═══════════════════════════════════════════════════════════════════════
// Step 6: Render with Remotion
// ═══════════════════════════════════════════════════════════════════════
console.log("\n══════════════════════════════════════════");
console.log("STEP 6: Rendering with Remotion");
console.log("══════════════════════════════════════════\n");

const finalOutput = join(ROOT, "final-output", "gas-gang-drizzle-pitch.mp4");
mkdirSync(dirname(finalOutput), { recursive: true });

// Calculate total duration for Remotion
const totalSceneFrames = remotionScenes.reduce((sum, s) => sum + s.durationFrames, 0);
const numTransitions = remotionScenes.length + 1; // intro→scenes→outro transitions
const transitionFrames = numTransitions * 15;
const totalFrames = props.introDurationFrames + totalSceneFrames + props.outroDurationFrames - transitionFrames;

console.log(`  Total frames: ${totalFrames} (${(totalFrames / FPS).toFixed(1)}s)`);
console.log(`  Composition: ScoutReplay`);
console.log(`  Output: ${finalOutput}`);

try {
  const renderCmd = [
    "cd", join(ROOT, "demo-render"), "&&",
    "npx", "remotion", "render",
    "src/index.ts", "ScoutReplay",
    `--props='${JSON.stringify(props)}'`,
    `--output="${finalOutput}"`,
    "--codec=h264",
    "--image-format=jpeg",
    "--jpeg-quality=90",
    `--width=${VIEWPORT.width}`,
    `--height=${VIEWPORT.height}`,
  ].join(" ");

  console.log(`  Rendering...`);
  execSync(renderCmd, { stdio: "inherit", timeout: 600000 });
  console.log(`\n  ✓ Video rendered: ${finalOutput}`);
} catch (err) {
  console.error(`  ✗ Render failed: ${err.message}`);
  console.log("\n  Try previewing first: cd demo-render && npx remotion studio");
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════
// Done
// ═══════════════════════════════════════════════════════════════════════
console.log("\n══════════════════════════════════════════");
console.log("DONE");
console.log("══════════════════════════════════════════");
console.log(`\nOutput: ${finalOutput}`);
console.log(`Props:  ${propsPath}`);
console.log(`Images: ${imagesDir}/`);
console.log(`Audio:  ${audioDir}/`);

// ═══════════════════════════════════════════════════════════════════════
// Helper functions
// ═══════════════════════════════════════════════════════════════════════

/**
 * Parse the pitch script markdown into structured scenes.
 * Expects ## Scene N — Title format with > blockquotes for narration
 * and **Visuals:** sections for image prompts.
 */
function parseScript(md) {
  const sceneBlocks = md.split(/^## Scene \d+/m).slice(1); // skip header before first scene
  const durationTable = parseDurationTable(md);

  return sceneBlocks.map((block, i) => {
    const id = i + 1;

    // Extract title from first line
    const titleMatch = block.match(/^[^]*?\n/);
    const rawTitle = titleMatch ? titleMatch[0].replace(/^[\s—–-]+/, "").trim() : `Scene ${id}`;
    // Clean markdown formatting from title
    const title = rawTitle.replace(/\*\*/g, "");

    // Extract narration (blockquotes)
    const narrationLines = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("> ")) {
        const text = line.replace(/^>\s*/, "").trim();
        if (text) narrationLines.push(text);
      }
    }
    const narration = narrationLines.join("\n");

    // Extract visuals section
    const visualsMatch = block.match(/\*\*Visuals?:\*\*([^]*?)(?=\n---|\n##|$)/);
    const visuals = visualsMatch ? visualsMatch[1].trim() : "";

    // Build image generation prompt
    const imagePrompt = buildImagePrompt(title, narration, visuals, id, sceneBlocks.length);

    // Get target duration from table or estimate from narration length
    const targetDurationSec = durationTable[id] || Math.max(10, Math.ceil(narration.length / 15));

    // Lower third text
    const lowerThird = extractLowerThird(title, narration);

    return { id, title, narration, visuals, imagePrompt, targetDurationSec, lowerThird };
  });
}

/**
 * Parse the duration table from the markdown if present.
 */
function parseDurationTable(md) {
  const table = {};
  const rows = md.match(/\| \d+ —.*?\| \d+s/g) || [];
  for (const row of rows) {
    const match = row.match(/\| (\d+) —.*?\| (\d+)s/);
    if (match) {
      table[parseInt(match[1])] = parseInt(match[2]);
    }
  }

  // Also try the scene name format
  const sceneNames = [
    "Real Problem", "Big Players", "Control Problem", "Define Once",
    "Online Presence", "Everyone Wins", "Scale", "Sovereignty",
    "Infrastructure", "Close"
  ];
  const nameRows = md.match(/\|.*?\|\s*\d+s\s*\|/g) || [];
  for (const row of nameRows) {
    for (let i = 0; i < sceneNames.length; i++) {
      if (row.includes(sceneNames[i])) {
        const durMatch = row.match(/(\d+)s/);
        if (durMatch) table[i + 1] = parseInt(durMatch[1]);
      }
    }
  }

  return table;
}

/**
 * Build a detailed image generation prompt for GPT Image 1.5.
 */
function buildImagePrompt(title, narration, visuals, sceneNum, totalScenes) {
  const style = [
    "Cinematic 16:9 widescreen composition.",
    "Dark, moody color grading with deep blacks and warm amber/gold highlights.",
    "Modern documentary film aesthetic. No text overlays. No UI elements.",
    "Professional product photography or editorial style.",
    "Photorealistic. High detail. Dramatic lighting.",
  ].join(" ");

  // Scene-specific prompts
  const scenePrompts = {
    1: `A dimly lit smoke shop counter. A cardboard box of mixed vape cartridges is open, products scattered randomly. The store owner looks at the box with mild frustration, checking items against a handwritten list. Warm overhead lighting. Cannabis dispensary / smoke shop interior. ${style}`,

    2: `A dramatic hero shot of premium cannabis vape cartridge packaging — sleek boxes, branded carts, colorful packaging — arranged like a magazine product spread. Multiple brands visible. Shot from above at an angle. Premium feel, like a luxury product showcase. Gold and deep purple lighting. ${style}`,

    3: `Split screen concept: On the left, a messy online store listing showing "Random Flavour" with a generic product photo. On the right, a pristine Coca-Cola shelf in a convenience store — perfectly organized, every label facing forward, consistent branding. The contrast between chaos and control. ${style}`,

    4: `A futuristic holographic-style visualization showing one product definition branching out to multiple store screens. A central glowing product card (vape cart with brand name, flavour, image) connected by light streams to 6-8 smaller screens arranged in a semicircle, each showing the same product identically. Dark background with blue/amber glow. ${style}`,

    5: `Multiple mobile phones and tablets arranged on a dark surface, each showing a clean, modern online store with the same cannabis products listed identically — same images, same names, same flavours. Each screen represents a different store but the product presentation is consistent. Warm backlighting. ${style}`,

    6: `Three hands meeting in the center of the frame — a handshake moment. One hand represents the distributor (wearing a watch, business casual), one the store owner (work gloves, practical), one the customer (holding a phone showing a product). Connected by a subtle golden glow. Dark cinematic background. ${style}`,

    7: `A dark map of Canada from above at night, with glowing amber dots representing store locations. Starting with 5 dots, expanding to 50+. Data visualization overlay — subtle bar charts, trend lines, heat zones. Like a war room command center display. Cinematic aerial perspective. ${style}`,

    8: `A secure server rack or mini-PC computer sitting on a wooden table with Indigenous art or beadwork visible nearby. A glowing lock/shield icon hovering above it. The Signal app logo subtly reflected in the surface. Warm interior lighting mixing with cool blue tech glow. Represents data sovereignty and local control. ${style}`,

    9: `An aerial shot of roads connecting small communities, like a network diagram but real. Highways linking towns, with glowing connection lines overlaid. Represents infrastructure — the roads, power lines, and digital connections that link everything together. Golden hour lighting from above. ${style}`,

    10: `A dramatic silhouette shot of someone standing at the edge of a modern building, looking out over a landscape at dawn. The future. Confident posture. The sky is transitioning from dark to golden. Represents taking the first step, leading the market. Cinematic, powerful, forward-looking. ${style}`,
  };

  return scenePrompts[sceneNum] || `${visuals}. ${style}`;
}

/**
 * Extract a short lower-third label from scene title/narration.
 */
function extractLowerThird(title, narration) {
  // Map scene titles to clean lower thirds
  const lowerThirds = {
    "The Real Problem": "The Industry Today",
    "The Big Players": "Market Leaders",
    "The Control Problem": "Brand Control",
    "Define Once, Appear Everywhere": "One Product. Every Store.",
    "Every Store Gets an Online Presence": "Ecommerce Everywhere",
    "Everyone Wins": "Win-Win-Win",
    "Scale Changes Everything": "Data at Scale",
    "Your Data, Your Territory": "Data Sovereignty",
    "Infrastructure": "Building Infrastructure",
    "The Close": null, // No lower third on close
    "End Card": null,
  };

  for (const [key, value] of Object.entries(lowerThirds)) {
    if (title.includes(key)) return value;
  }

  return title.replace(/[—–-]\s*/, "").substring(0, 40);
}

/**
 * Generate an image using OpenAI GPT Image 1.5 API.
 */
async function generateImage(apiKey, prompt, outputPath) {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1.5",
      prompt,
      n: 1,
      size: "1536x1024", // Landscape, close to 16:9
      quality: "medium",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${error}`);
  }

  const data = await response.json();

  // GPT Image 1.5 returns base64 or URL
  if (data.data[0].b64_json) {
    const buffer = Buffer.from(data.data[0].b64_json, "base64");
    writeFileSync(outputPath, buffer);
  } else if (data.data[0].url) {
    const imgResponse = await fetch(data.data[0].url);
    const buffer = Buffer.from(await imgResponse.arrayBuffer());
    writeFileSync(outputPath, buffer);
  } else {
    throw new Error("No image data in response");
  }
}

/**
 * Create a placeholder image (solid dark frame with title text) via ffmpeg.
 */
function createPlaceholderImage(outputPath, title) {
  try {
    const safeTitle = title.replace(/'/g, "'\\''").substring(0, 50);
    execSync(
      `ffmpeg -y -f lavfi -i color=c=0x1a1a2e:s=1536x1024:d=1 -frames:v 1 -vf "drawtext=text='${safeTitle}':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2" "${outputPath}" 2>/dev/null`,
      { timeout: 10000 }
    );
  } catch {
    // Ultra-fallback: just create a tiny PNG
    execSync(`ffmpeg -y -f lavfi -i color=c=0x1a1a2e:s=1536x1024:d=1 -frames:v 1 "${outputPath}" 2>/dev/null`, { timeout: 10000 });
  }
}

/**
 * Get audio duration in seconds via ffprobe.
 */
function getAudioDuration(audioPath) {
  if (!existsSync(audioPath)) return 180; // fallback 3 min
  try {
    const result = execSync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${audioPath}"`,
      { encoding: "utf8", timeout: 10000 }
    ).trim();
    return parseFloat(result) || 180;
  } catch {
    return 180;
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
 * Escape text for shell command.
 */
function escapeShell(text) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`")
    .replace(/\n/g, " ");
}

/**
 * Run a timeline audit on the built props, checking that scene transitions
 * align with narration content. Returns { scenes, issues } — issues is an
 * array of human-readable strings describing any misalignments.
 *
 * This runs automatically before every render so alignment problems are
 * caught before wasting time on a render.
 */
function runTimelineAudit(props, sceneDefinitions) {
  const wordTimings = props.wordTimings || [];
  const TRANSITION_FRAMES = 15;
  const timeline = [];
  const issues = [];

  for (let i = 0; i < props.scenes.length; i++) {
    const scene = props.scenes[i];
    const startSec = scene.audioOffsetMs / 1000;
    const durationSec = scene.durationFrames / FPS;
    const endSec = startSec + durationSec;
    const crossfadeSec = startSec + durationSec * 0.6;

    const sceneWords = wordTimings
      .filter((w) => w.startMs >= scene.audioOffsetMs && w.startMs < scene.audioOffsetMs + durationSec * 1000)
      .map((w) => ({ text: w.text, sec: +(w.startMs / 1000).toFixed(2) }));

    const narrationPreview = sceneWords.map((w) => w.text).join(" ");

    timeline.push({
      id: i + 1,
      startSec: +startSec.toFixed(2),
      endSec: +endSec.toFixed(2),
      durationSec: +durationSec.toFixed(1),
      imageBefore: scene.screenshotBefore,
      imageAfter: scene.screenshotAfter,
      crossfadeAtSec: +crossfadeSec.toFixed(2),
      lowerThird: scene.lowerThird,
      wordCount: sceneWords.length,
      narrationPreview: narrationPreview.length > 120 ? narrationPreview.substring(0, 120) + "..." : narrationPreview,
      words: sceneWords,
    });
  }

  // Check: scenes with no words
  for (const scene of timeline) {
    if (scene.wordCount === 0) {
      issues.push(`Scene ${scene.id}: NO WORDS — audio not aligned to this scene`);
    }
  }

  // Check: audio cutoff
  if (wordTimings.length > 0) {
    const audioEndSec = wordTimings[wordTimings.length - 1].endMs / 1000;
    const lastScene = timeline[timeline.length - 1];
    const introSec = (props.introDurationFrames || 90) / FPS;
    const contentStartSec = introSec - TRANSITION_FRAMES / FPS;
    const totalSceneFrames = props.scenes.reduce((s, sc) => s + sc.durationFrames, 0);
    const numTransitions = (props.scenes.length + 1) * TRANSITION_FRAMES;
    const totalFrames = props.introDurationFrames + totalSceneFrames + props.outroDurationFrames - numTransitions;
    const contentDurationSec = (totalFrames / FPS) - contentStartSec;

    if (contentDurationSec < audioEndSec) {
      issues.push(`AUDIO CUTOFF: audio ends at ${audioEndSec.toFixed(1)}s but content duration is only ${contentDurationSec.toFixed(1)}s — last ${(audioEndSec - contentDurationSec).toFixed(1)}s will be clipped`);
    }
  }

  // Check: crossfade timing vs content keywords
  for (const scene of timeline) {
    if (scene.imageBefore === scene.imageAfter) continue;

    const afterKeywords = scene.imageAfter.replace(/screenshots\//, "").replace(/scene-\d+-?/, "").replace(/\.(png|jpg)/, "")
      .split(/[-_.]/).filter((w) => w.length > 3).map((w) => w.toLowerCase());

    for (const keyword of afterKeywords) {
      const firstMention = scene.words.find((w) => w.text.toLowerCase().replace(/[.,!?]/g, "") === keyword);
      if (firstMention && firstMention.sec < scene.crossfadeAtSec) {
        const delta = scene.crossfadeAtSec - firstMention.sec;
        if (delta > 5) {
          issues.push(`Scene ${scene.id}: "${keyword}" spoken at ${firstMention.sec}s but after-image doesn't show until crossfade at ${scene.crossfadeAtSec}s (${delta.toFixed(1)}s late)`);
        }
      }
    }
  }

  return { scenes: timeline, issues };
}

/**
 * Sync scene boundaries to actual Whisper word timings.
 *
 * For each scene, finds where its narration starts in the transcribed audio
 * by matching the first few words. This ensures slides change exactly when
 * the narrator starts speaking that scene's content.
 *
 * Falls back to character-ratio estimation only if word timings are empty.
 */
function syncScenesToWordTimings(scenes, wordTimings, audioDurationSec) {
  // Fallback: if no word timings, use character-ratio estimation
  if (!wordTimings || wordTimings.length === 0) {
    console.log("  ⚠ No word timings — using character-ratio estimation");
    const totalChars = scenes.reduce((sum, s) => sum + s.narration.length, 0);
    let offsetMs = 0;
    return scenes.map((scene) => {
      const ratio = scene.narration.length / totalChars;
      const durationMs = audioDurationSec * 1000 * ratio;
      const boundary = { startMs: offsetMs, endMs: offsetMs + durationMs };
      offsetMs += durationMs;
      return boundary;
    });
  }

  console.log("  Syncing scenes to Whisper word timings...");

  // Normalize a word for fuzzy matching: lowercase, strip punctuation
  const normalize = (w) => w.toLowerCase().replace(/[.,!?;:'"()\-]/g, "").trim();

  // For each scene, extract the first N words of its narration
  const sceneFirstWords = scenes.map((s) =>
    s.narration.split(/\s+/).slice(0, 6).map(normalize).filter(Boolean)
  );

  // Search sequentially through word timings to find each scene's start
  const boundaries = [];
  let searchFrom = 0;

  for (let s = 0; s < scenes.length; s++) {
    const target = sceneFirstWords[s];
    let foundIdx = -1;

    // Try to match the first 3-4 words of the scene in sequence
    const matchLen = Math.min(target.length, 4);
    for (let i = searchFrom; i < wordTimings.length - matchLen; i++) {
      let matched = 0;
      for (let k = 0; k < matchLen; k++) {
        const actual = normalize(wordTimings[i + k].text);
        // Match if the first 3 chars align (handles contractions, plurals, etc.)
        if (actual.substring(0, 3) === target[k].substring(0, 3)) {
          matched++;
        }
      }
      if (matched >= matchLen - 1) { // Allow 1 fuzzy miss
        foundIdx = i;
        break;
      }
    }

    if (foundIdx >= 0) {
      boundaries.push({ startMs: wordTimings[foundIdx].startMs, endMs: 0 });
      searchFrom = foundIdx + 1;
      console.log(`    Scene ${s + 1}: word[${foundIdx}] "${wordTimings[foundIdx].text}" at ${(wordTimings[foundIdx].startMs / 1000).toFixed(1)}s`);
    } else {
      // If not found, interpolate from previous boundary
      const prevEnd = boundaries.length > 0 ? boundaries[boundaries.length - 1].startMs : 0;
      const estMs = prevEnd + (scenes[s].narration.length / scenes[s - 1]?.narration.length || 1) * 15000;
      boundaries.push({ startMs: estMs, endMs: 0 });
      console.log(`    Scene ${s + 1}: NOT FOUND — estimated at ${(estMs / 1000).toFixed(1)}s`);
    }
  }

  // Fill in endMs: each scene ends where the next begins (last scene ends at audio end)
  for (let i = 0; i < boundaries.length; i++) {
    boundaries[i].endMs = i < boundaries.length - 1
      ? boundaries[i + 1].startMs
      : wordTimings[wordTimings.length - 1].endMs;
  }

  return boundaries;
}

/**
 * Generate narration via Edge TTS (free). Uses --file flag to avoid shell escaping issues.
 */
async function generateEdgeTts(text, outputPath, audioDir) {
  const voice = "en-US-GuyNeural";
  const subsPath = join(audioDir, "narration.vtt");
  const textFile = join(audioDir, "narration-input.txt");

  // Write text to file and use --file flag to avoid shell escaping issues
  writeFileSync(textFile, text);

  try {
    execSync(
      `edge-tts --voice "${voice}" --rate="-10%" --file "${textFile}" --write-media "${outputPath}" --write-subtitles "${subsPath}"`,
      { timeout: 120000, stdio: "pipe" }
    );
    console.log(`  ✓ Audio: ${basename(outputPath)}`);
    console.log(`  ✓ Subtitles: ${basename(subsPath)}`);
  } catch (err) {
    console.error(`  ✗ Edge TTS failed: ${err.message}`);
    console.error("  Make sure edge-tts is installed: pip install edge-tts");
    process.exit(1);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
