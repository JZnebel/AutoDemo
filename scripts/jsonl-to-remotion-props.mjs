#!/usr/bin/env node

/**
 * JSONL → Remotion Props Converter
 *
 * Reads a walkthrough.jsonl file (produced by the Chrome DevTools MCP
 * PostToolUse hook during the scout phase) and generates Remotion props:
 * zoom regions, lower third triggers, transition points, and timeline data.
 *
 * This bridges the scout phase directly to Remotion rendering — the AI
 * explores the app, and this script converts that exploration into a
 * cinematic video composition.
 *
 * Usage:
 *   node scripts/jsonl-to-remotion-props.mjs [walkthrough.jsonl] [props.json]
 *   node scripts/jsonl-to-remotion-props.mjs walkthrough.jsonl demo-render/props.json
 *
 * Options (env vars):
 *   FPS=30                    Frame rate (default: 30)
 *   SCENE_GAP_SEC=2           Seconds between scenes (default: 2)
 *   ZOOM_DURATION_SEC=3       How long each zoom lasts (default: 3)
 *   ZOOM_SCALE=1.3            Default zoom scale factor (default: 1.3)
 *   LOWER_THIRD_SEC=5         How long lower thirds display (default: 5)
 *   INTRO_SEC=5               Intro card duration (default: 5)
 *   OUTRO_SEC=5               Outro card duration (default: 5)
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════════════
const FPS = parseInt(process.env.FPS || "30");
const SCENE_GAP_SEC = parseFloat(process.env.SCENE_GAP_SEC || "2");
const ZOOM_DURATION_SEC = parseFloat(process.env.ZOOM_DURATION_SEC || "3");
const ZOOM_SCALE = parseFloat(process.env.ZOOM_SCALE || "1.3");
const LOWER_THIRD_SEC = parseFloat(process.env.LOWER_THIRD_SEC || "5");
const INTRO_SEC = parseFloat(process.env.INTRO_SEC || "5");
const OUTRO_SEC = parseFloat(process.env.OUTRO_SEC || "5");

const secToFrame = (sec) => Math.round(sec * FPS);

// ═══════════════════════════════════════════════════════════════════════
// Parse args
// ═══════════════════════════════════════════════════════════════════════
const inputPath = process.argv[2] || join(process.cwd(), "walkthrough.jsonl");
const outputPath = process.argv[3] || join(process.cwd(), "demo-render", "props.json");

if (!existsSync(inputPath)) {
  console.error(`Walkthrough file not found: ${inputPath}`);
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════
// Parse JSONL into scenes
// ═══════════════════════════════════════════════════════════════════════
const lines = readFileSync(inputPath, "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));

console.log(`Loaded ${lines.length} actions from ${inputPath}`);

// Group by navigation into scenes
const scenes = [];
let currentScene = null;

for (const entry of lines) {
  if (entry.action === "navigate-page" && entry.context?.navigateUrl) {
    if (currentScene) scenes.push(currentScene);
    currentScene = {
      url: entry.context.navigateUrl,
      path: safeParsePath(entry.context.navigateUrl),
      actions: [],
      startTime: entry.ts,
    };
    continue;
  }

  if (!currentScene) {
    currentScene = {
      url: entry.context?.url || "unknown",
      path: safeParsePath(entry.context?.url || "/"),
      actions: [],
      startTime: entry.ts,
    };
  }

  currentScene.actions.push(entry);
}
if (currentScene) scenes.push(currentScene);

console.log(`Grouped into ${scenes.length} scenes`);

// ═══════════════════════════════════════════════════════════════════════
// Build timeline
// ═══════════════════════════════════════════════════════════════════════

// Estimate duration per scene based on action count and types
function estimateSceneDuration(scene) {
  let ms = 2000; // Base: 2s for page load + initial view

  for (const action of scene.actions) {
    switch (action.action) {
      case "click":
        ms += 1200; // cursorClick animation
        break;
      case "fill":
        ms += (action.context?.fillValue?.length || 5) * 200; // typing
        break;
      case "hover":
        ms += 500;
        break;
      case "press-key":
        ms += 300;
        break;
      case "take-snapshot":
        ms += 100; // nearly instant
        break;
      case "evaluate-script":
        ms += 300;
        break;
      default:
        ms += 200;
    }
  }

  // Minimum 3 seconds per scene for readability
  return Math.max(3, ms / 1000);
}

let timelineCursor = 0; // seconds into the main video content
const sceneTimeline = [];

for (const scene of scenes) {
  const duration = estimateSceneDuration(scene);
  sceneTimeline.push({
    ...scene,
    startSec: timelineCursor,
    endSec: timelineCursor + duration,
    durationSec: duration,
  });
  timelineCursor += duration + SCENE_GAP_SEC;
}

const videoDurationSec = timelineCursor - SCENE_GAP_SEC; // Remove trailing gap
console.log(`Estimated video duration: ${videoDurationSec.toFixed(1)}s`);

// ═══════════════════════════════════════════════════════════════════════
// Generate zoom regions
// ═══════════════════════════════════════════════════════════════════════

const zoomRegions = [];

for (const scene of sceneTimeline) {
  let actionTimeCursor = scene.startSec;

  for (const action of scene.actions) {
    // Generate zoom for click actions that have bounds
    if (action.action === "click" && action.context?.bounds) {
      const bounds = action.context.bounds;
      const focusX = (bounds.x || 0) + (bounds.w || 0) / 2;
      const focusY = (bounds.y || 0) + (bounds.h || 0) / 2;

      // Only zoom if the element is in a specific area (not full-width)
      if (bounds.w && bounds.w < 800) {
        zoomRegions.push({
          startFrame: secToFrame(actionTimeCursor),
          endFrame: secToFrame(actionTimeCursor + ZOOM_DURATION_SEC),
          focusX: Math.round(focusX),
          focusY: Math.round(focusY),
          scale: ZOOM_SCALE,
          label: action.context?.uidLabel || null,
        });
      }

      actionTimeCursor += 1.2; // cursorClick duration
    } else if (action.action === "fill") {
      const charCount = action.context?.fillValue?.length || 5;
      actionTimeCursor += charCount * 0.2;
    } else if (action.action === "click") {
      // Click without bounds — default center position
      actionTimeCursor += 1.2;
    } else {
      actionTimeCursor += 0.3;
    }
  }
}

console.log(`Generated ${zoomRegions.length} zoom regions`);

// ═══════════════════════════════════════════════════════════════════════
// Generate lower thirds (one per scene)
// ═══════════════════════════════════════════════════════════════════════

const lowerThirds = sceneTimeline
  .map((scene) => {
    // Derive a label from the URL path
    const label = pathToLabel(scene.path);
    if (!label) return null;

    return {
      label,
      startFrame: secToFrame(scene.startSec + 0.5), // Slight delay after scene starts
      durationFrames: secToFrame(LOWER_THIRD_SEC),
    };
  })
  .filter(Boolean);

console.log(`Generated ${lowerThirds.length} lower thirds`);

// ═══════════════════════════════════════════════════════════════════════
// Generate transition points
// ═══════════════════════════════════════════════════════════════════════

const transitions = sceneTimeline.slice(1).map((scene, i) => ({
  frame: secToFrame(scene.startSec),
  fromScene: sceneTimeline[i].path,
  toScene: scene.path,
  type: "fade", // Default transition type
}));

// ═══════════════════════════════════════════════════════════════════════
// Generate narration hints per scene
// ═══════════════════════════════════════════════════════════════════════

const narrationHints = sceneTimeline.map((scene) => ({
  scene: scene.path,
  startSec: scene.startSec,
  durationSec: scene.durationSec,
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
}));

// ═══════════════════════════════════════════════════════════════════════
// Build final props
// ═══════════════════════════════════════════════════════════════════════

const videoDurationFrames = secToFrame(videoDurationSec);

const props = {
  // Core Remotion props (compatible with Demo.tsx)
  wordTimings: [], // Populated later by Whisper after TTS
  lowerThirds,
  zoomRegions: zoomRegions.map(({ label, ...r }) => r), // Strip label for Remotion
  showAvatar: false,
  audioVolume: 1.3,
  introDurationFrames: secToFrame(INTRO_SEC),
  transitionDurationFrames: 0,
  videoDurationFrames,
  outroDurationFrames: secToFrame(OUTRO_SEC),

  // Extended metadata (for pipeline use, not passed to Remotion directly)
  _meta: {
    generatedFrom: inputPath,
    generatedAt: new Date().toISOString(),
    fps: FPS,
    scenes: sceneTimeline.map((s) => ({
      path: s.path,
      url: s.url,
      startSec: s.startSec,
      endSec: s.endSec,
      durationSec: s.durationSec,
      actionCount: s.actions.length,
    })),
    transitions,
    narrationHints,
    zoomLabels: zoomRegions.map((z) => ({
      label: z.label,
      startFrame: z.startFrame,
      focusX: z.focusX,
      focusY: z.focusY,
    })),
    totalDurationSec: INTRO_SEC + videoDurationSec + OUTRO_SEC,
  },
};

// ═══════════════════════════════════════════════════════════════════════
// Write output
// ═══════════════════════════════════════════════════════════════════════

writeFileSync(outputPath, JSON.stringify(props, null, 2));
console.log(`\nRemiotion props written to: ${outputPath}`);
console.log(`\nTimeline:`);
for (const scene of sceneTimeline) {
  const label = pathToLabel(scene.path) || scene.path;
  console.log(
    `  ${scene.startSec.toFixed(1)}s - ${scene.endSec.toFixed(1)}s  ${label.padEnd(25)} (${scene.actions.length} actions)`
  );
}
console.log(`\nTotal: ${props._meta.totalDurationSec.toFixed(1)}s (intro: ${INTRO_SEC}s + content: ${videoDurationSec.toFixed(1)}s + outro: ${OUTRO_SEC}s)`);
console.log(`Zoom regions: ${zoomRegions.length}`);
console.log(`Lower thirds: ${lowerThirds.length}`);
console.log(`Transitions: ${transitions.length}`);

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

  // Convert kebab-case or snake_case to Title Case
  return segment
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
