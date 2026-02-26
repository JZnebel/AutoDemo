#!/usr/bin/env node

/**
 * JSONL + Screenshots → ScoutReplay Props Converter
 *
 * Reads a walkthrough.jsonl file and a screenshots directory to generate
 * props for the ScoutReplay Remotion composition. Unlike jsonl-to-remotion-props.mjs
 * (which generates props for the video-recording-based Demo composition), this
 * generates props for the screenshot-based ScoutReplay composition.
 *
 * The output is a complete props.json ready for Remotion — no screen recording needed.
 *
 * Scene strategy: Creates one scene per screenshot. Actions (click, fill, etc.)
 * between screenshots are grouped into the scene of the preceding screenshot.
 * This produces a natural scene flow where each screenshot shows the result of
 * the previous scene's actions.
 *
 * Usage:
 *   node scripts/jsonl-to-scout-props.mjs <walkthrough.jsonl> [screenshots-dir] [output.json]
 *
 * Options (env vars):
 *   FPS=30                    Frame rate (default: 30)
 *   SCENE_DURATION_SEC=5      Base scene duration (default: 5)
 *   ACTION_DELAY_SEC=1.2      Delay between actions within a scene (default: 1.2)
 *   INTRO_SEC=5               Intro card duration (default: 5)
 *   OUTRO_SEC=5               Outro card duration (default: 5)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, copyFileSync, mkdirSync } from "fs";
import { join, dirname, resolve, basename, isAbsolute } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════════════
const FPS = parseInt(process.env.FPS || "30");
const SCENE_DURATION_SEC = parseFloat(process.env.SCENE_DURATION_SEC || "5");
const ACTION_DELAY_SEC = parseFloat(process.env.ACTION_DELAY_SEC || "1.2");
const INTRO_SEC = parseFloat(process.env.INTRO_SEC || "5");
const OUTRO_SEC = parseFloat(process.env.OUTRO_SEC || "5");

const secToFrame = (sec) => Math.round(sec * FPS);

// ═══════════════════════════════════════════════════════════════════════
// Parse args
// ═══════════════════════════════════════════════════════════════════════
const inputPath = process.argv[2] || join(process.cwd(), "walkthrough.jsonl");
const screenshotsDir = process.argv[3] || join(dirname(inputPath), "screenshots");
const outputPath = process.argv[4] || join(process.cwd(), "demo-render", "scout-replay-props.json");

if (!existsSync(inputPath)) {
  console.error(`Walkthrough file not found: ${inputPath}`);
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════
// Load screenshots from directory
// ═══════════════════════════════════════════════════════════════════════
let screenshotFiles = [];
if (existsSync(screenshotsDir)) {
  screenshotFiles = readdirSync(screenshotsDir)
    .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))
    .sort();
  console.log(`Found ${screenshotFiles.length} screenshots in ${screenshotsDir}`);
} else {
  console.warn(`Screenshots directory not found: ${screenshotsDir}`);
}

// ═══════════════════════════════════════════════════════════════════════
// Parse JSONL
// ═══════════════════════════════════════════════════════════════════════
const lines = readFileSync(inputPath, "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));

console.log(`Loaded ${lines.length} entries from ${inputPath}`);

// ═══════════════════════════════════════════════════════════════════════
// Build UID → label+role map from snapshot entries
// ═══════════════════════════════════════════════════════════════════════
// Snapshots contain accessibility tree data like:
//   uid=73_52 heading "Simple Product" level="3"
//   uid=76_24 button "Exact"
// We parse these to resolve UIDs referenced by click/fill actions.
let uidMap = {}; // uid → { label, role }

function parseSnapshotUids(resultPreview) {
  if (!resultPreview) return;

  // resultPreview may be a JSON string like [{"type":"text","text":"..."}]
  // that was truncated by the logging hook. Try to parse, fall back to raw.
  let text = resultPreview;
  try {
    const parsed = JSON.parse(resultPreview);
    if (Array.isArray(parsed)) {
      text = parsed.map((p) => p.text || "").join("\n");
    }
  } catch {
    // Truncated JSON or plain text — unescape \" to " for regex matching
    text = resultPreview.replace(/\\"/g, '"');
  }

  // Match patterns like: uid=73_52 button "Simple Product"
  const uidPattern = /uid=(\S+)\s+(\w+)\s+"([^"]*?)"/g;
  let match;
  while ((match = uidPattern.exec(text)) !== null) {
    uidMap[match[1]] = { label: match[3], role: match[2] };
  }
}

// First pass: parse ALL snapshots to build the full UID map
for (const entry of lines) {
  if (entry.action === "take-snapshot" && entry.resultPreview) {
    parseSnapshotUids(entry.resultPreview);
  }
}
console.log(`UID map: ${Object.keys(uidMap).length} elements resolved from snapshots`);

// ═══════════════════════════════════════════════════════════════════════
// Build screenshot-based scenes
// ═══════════════════════════════════════════════════════════════════════
// Strategy: Each screenshot starts a new scene. Actions between screenshots
// are grouped into the preceding screenshot's scene.
//
// Example JSONL flow:
//   navigate → screenshot-A → click → click → screenshot-B → click → screenshot-C
// Produces scenes:
//   Scene 1: screenshotBefore=A, actions=[click, click], screenshotAfter=B
//   Scene 2: screenshotBefore=B, actions=[click],        screenshotAfter=C
//   Scene 3: screenshotBefore=C, actions=[],              (final state)

const rawScenes = [];
let pendingActions = [];
let lastScreenshotPath = null;
let currentUrl = "";
let currentPath = "/";

for (const entry of lines) {
  // Track URL from navigate actions
  if (entry.action === "navigate-page" && entry.context?.navigateUrl) {
    currentUrl = entry.context.navigateUrl;
    currentPath = safeParsePath(currentUrl);
    continue;
  }

  // When we hit a screenshot, flush pending actions into a scene
  if (entry.action === "take-screenshot" && entry.context?.screenshotPath) {
    const screenshotPath = entry.context.screenshotPath;

    if (lastScreenshotPath) {
      // We have a previous screenshot — create a scene for the actions between them
      rawScenes.push({
        screenshotBefore: lastScreenshotPath,
        screenshotAfter: screenshotPath,
        actions: pendingActions,
        url: currentUrl,
        path: currentPath,
      });
      pendingActions = [];
    }

    lastScreenshotPath = screenshotPath;
    continue;
  }

  // Skip snapshot entries (already processed for UID map)
  if (entry.action === "take-snapshot") continue;

  // Enrich click/fill entries with UID label from snapshot map
  if (entry.context?.uid && uidMap[entry.context.uid]) {
    entry.context.uidLabel = uidMap[entry.context.uid].label;
    entry.context.uidRole = uidMap[entry.context.uid].role;
  }

  // Accumulate actions
  if (["click", "fill", "press-key", "fill-form", "hover"].includes(entry.action)) {
    pendingActions.push(entry);
  }
}

// Final scene: last screenshot with remaining actions (holds for viewing)
if (lastScreenshotPath) {
  rawScenes.push({
    screenshotBefore: lastScreenshotPath,
    screenshotAfter: undefined,
    actions: pendingActions,
    url: currentUrl,
    path: currentPath,
  });
}

console.log(`Built ${rawScenes.length} screenshot-based scenes`);

// ═══════════════════════════════════════════════════════════════════════
// Copy screenshots to Remotion public directory
// ═══════════════════════════════════════════════════════════════════════
const remotionPublicDir = join(dirname(outputPath), "public", "screenshots");
mkdirSync(remotionPublicDir, { recursive: true });

// Normalize screenshot path: resolve absolute path, copy to public/, return staticFile path
function normalizeScreenshotPath(rawPath) {
  if (!rawPath) return null;

  // Resolve the absolute source path
  let srcPath = rawPath;
  if (!isAbsolute(rawPath)) {
    srcPath = join(dirname(inputPath), rawPath);
  }

  const filename = basename(srcPath);
  const destPath = join(remotionPublicDir, filename);

  // Copy if source exists
  if (existsSync(srcPath)) {
    copyFileSync(srcPath, destPath);
  }

  // Return path relative to Remotion's public/ directory (for staticFile())
  return `screenshots/${filename}`;
}

// ═══════════════════════════════════════════════════════════════════════
// Build ScoutReplay scenes
// ═══════════════════════════════════════════════════════════════════════

const scoutScenes = rawScenes.map((scene, sceneIdx) => {
  const screenshotBefore = normalizeScreenshotPath(scene.screenshotBefore);
  const screenshotAfter = normalizeScreenshotPath(scene.screenshotAfter);

  // Build actions with timing
  let delayCursor = secToFrame(1); // Start 1 second into scene
  const sceneActions = [];

  for (const entry of scene.actions) {
    if (entry.action === "click" && entry.context?.uid) {
      const bounds = entry.context.bounds || estimateBounds(entry.context);

      sceneActions.push({
        type: "click",
        bounds: bounds || undefined,
        label: entry.context.uidLabel || null,
        delayFrames: delayCursor,
      });

      delayCursor += secToFrame(ACTION_DELAY_SEC);
    }

    if (entry.action === "fill" && entry.context?.uid) {
      const bounds = entry.context.bounds || estimateBounds(entry.context);
      const value = entry.context.fillValue || entry.input?.value || "";

      sceneActions.push({
        type: "fill",
        bounds: bounds || undefined,
        label: entry.context.uidLabel || null,
        fillValue: value,
        delayFrames: delayCursor,
      });

      const typingFrames = value.length * 3 + 15;
      delayCursor += typingFrames;
    }

    if (entry.action === "press-key" && entry.context?.key) {
      sceneActions.push({
        type: "press-key",
        key: entry.context.key,
        delayFrames: delayCursor,
      });

      delayCursor += secToFrame(0.5);
    }
  }

  // Scene duration — enough to cover all actions + padding
  const actionDuration = delayCursor + secToFrame(1);
  const baseDuration = secToFrame(SCENE_DURATION_SEC);
  // Scenes with no actions (just showing a screenshot) get the base duration
  // Scenes with actions get enough time for all actions
  const durationFrames = sceneActions.length > 0
    ? Math.max(baseDuration, actionDuration)
    : baseDuration;

  return {
    screenshotBefore,
    screenshotAfter,
    actions: sceneActions,
    durationFrames,
    lowerThird: buildLowerThird(scene, sceneIdx),
    autoZoom: sceneActions.some((a) => a.type === "click" && a.bounds),
  };
});

// ═══════════════════════════════════════════════════════════════════════
// Generate narration hints (for generate-narration.mjs)
// ═══════════════════════════════════════════════════════════════════════

let timeCursor = INTRO_SEC;
const narrationHints = rawScenes.map((scene, i) => {
  const sceneDuration = scoutScenes[i].durationFrames / FPS;
  const startSec = timeCursor;
  timeCursor += sceneDuration;

  return {
    scene: scene.path,
    startSec,
    durationSec: sceneDuration,
    actions: scene.actions
      .filter((a) => ["click", "fill"].includes(a.action))
      .map((a) => {
        if (a.action === "click" && a.context?.uidLabel) {
          return `Click "${a.context.uidLabel}" (${a.context.uidRole || "element"})`;
        }
        if (a.action === "fill") {
          return `Type "${a.context?.fillValue || ""}" into ${a.context?.uidLabel || "input"}`;
        }
        return null;
      })
      .filter(Boolean),
  };
});

// ═══════════════════════════════════════════════════════════════════════
// Build final props
// ═══════════════════════════════════════════════════════════════════════

const totalSceneFrames = scoutScenes.reduce((sum, s) => sum + s.durationFrames, 0);

const props = {
  scenes: scoutScenes,
  wordTimings: [], // Populated later by Whisper after TTS
  captionStyle: "pop",
  showAvatar: false,
  audioVolume: 1.3,
  introDurationFrames: secToFrame(INTRO_SEC),
  outroDurationFrames: secToFrame(OUTRO_SEC),

  _meta: {
    composition: "ScoutReplay",
    generatedFrom: inputPath,
    screenshotsDir,
    generatedAt: new Date().toISOString(),
    fps: FPS,
    narrationHints,
    totalDurationSec: INTRO_SEC + totalSceneFrames / FPS + OUTRO_SEC,
    sceneCount: scoutScenes.length,
    screenshotCount: screenshotFiles.length,
  },
};

// ═══════════════════════════════════════════════════════════════════════
// Write output
// ═══════════════════════════════════════════════════════════════════════

writeFileSync(outputPath, JSON.stringify(props, null, 2));
console.log(`\nScoutReplay props written to: ${outputPath}`);
console.log(`\nTimeline:`);

let timelinePos = INTRO_SEC;
for (const scene of scoutScenes) {
  const dur = scene.durationFrames / FPS;
  const label = scene.lowerThird || "Scene";
  const actionLabels = scene.actions.map((a) => a.label || a.type).join(", ");
  console.log(
    `  ${timelinePos.toFixed(1)}s - ${(timelinePos + dur).toFixed(1)}s  ${label.padEnd(30)} [${scene.actions.length} actions${actionLabels ? ": " + actionLabels : ""}]  ${basename(scene.screenshotBefore)}${scene.screenshotAfter ? " → " + basename(scene.screenshotAfter) : ""}`,
  );
  timelinePos += dur;
}

const screenshotsCopied = scoutScenes.filter((s) => s.screenshotBefore).length;
console.log(
  `\nTotal: ${props._meta.totalDurationSec.toFixed(1)}s (intro: ${INTRO_SEC}s + content: ${(totalSceneFrames / FPS).toFixed(1)}s + outro: ${OUTRO_SEC}s)`,
);
console.log(`Scenes: ${scoutScenes.length}`);
console.log(`Screenshots copied to public/: ${screenshotsCopied}`);

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function safeParsePath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url || "/";
  }
}

function pathToLabel(path) {
  if (!path || path === "/") return null;
  const segment = path
    .replace(/^\//, "")
    .split("/")
    .filter(Boolean)
    .pop();
  if (!segment) return null;
  return segment
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Build a descriptive lower-third label for a scene.
 * Prioritizes action labels, falls back to URL path.
 */
function buildLowerThird(scene, sceneIdx) {
  // If scene has click actions with labels, use the first one
  const clickActions = scene.actions.filter(
    (a) => a.action === "click" && a.context?.uidLabel,
  );
  if (clickActions.length > 0) {
    const labels = clickActions.map((a) => a.context.uidLabel);
    return labels.length === 1
      ? `Click "${labels[0]}"`
      : `${labels.map((l) => `"${l}"`).join(" → ")}`;
  }

  // Fall back to page path
  return pathToLabel(scene.path) || `Step ${sceneIdx + 1}`;
}

/**
 * Estimate element bounds from context when explicit bounds aren't available.
 * Falls back to center-of-viewport with a reasonable default size.
 */
function estimateBounds(context) {
  const vp = context?.viewport || { w: 1920, h: 1080 };
  return {
    x: vp.w / 2 - 60,
    y: vp.h / 2 - 20,
    w: 120,
    h: 40,
  };
}
