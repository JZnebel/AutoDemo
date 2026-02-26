#!/usr/bin/env node

/**
 * JSONL → Recording Manifest Converter
 *
 * Reads a walkthrough.jsonl file (produced by the Chrome DevTools MCP
 * PostToolUse hook during the scout phase) and generates a structured
 * recording manifest compatible with lib/run.mjs.
 *
 * The scout phase is exploratory — Claude browses the app, clicks around,
 * takes snapshots. This script converts that exploration into a repeatable
 * recording plan.
 *
 * Usage:
 *   node scripts/jsonl-to-manifest.mjs [walkthrough.jsonl] [output.json]
 *   node scripts/jsonl-to-manifest.mjs walkthrough.jsonl manifest.json
 *
 * Output: A manifest.json with scenes grouped by page navigation.
 * Each scene contains the URL, recorded interactions, narration hints,
 * and budget action estimates.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════════════════════════════
// Parse args
// ═══════════════════════════════════════════════════════════════════════
const inputPath = process.argv[2] || join(process.cwd(), "walkthrough.jsonl");
const outputPath = process.argv[3] || inputPath.replace(/\.jsonl$/, "-manifest.json");

if (!existsSync(inputPath)) {
  console.error(`Walkthrough file not found: ${inputPath}`);
  console.error("Run a scout session with Chrome DevTools MCP first.");
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════
// Parse JSONL
// ═══════════════════════════════════════════════════════════════════════
const lines = readFileSync(inputPath, "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));

console.log(`Loaded ${lines.length} actions from ${inputPath}`);

// ═══════════════════════════════════════════════════════════════════════
// Group actions into scenes (each navigation starts a new scene)
// ═══════════════════════════════════════════════════════════════════════
const scenes = [];
let currentScene = null;

for (const entry of lines) {
  const { action, input, context } = entry;

  // Navigation starts a new scene
  if (action === "navigate-page" && context?.navigateUrl) {
    if (currentScene) {
      scenes.push(currentScene);
    }
    currentScene = {
      name: slugify(context.navigateUrl),
      url: context.navigateUrl,
      actions: [],
      selectors: [],
      narrationHints: [],
      snapshotCount: 0,
    };
    continue;
  }

  // If no navigation yet, create an implicit first scene
  if (!currentScene) {
    const url = context?.url || "http://localhost:3010";
    currentScene = {
      name: slugify(url),
      url,
      actions: [],
      selectors: [],
      narrationHints: [],
      snapshotCount: 0,
    };
  }

  // Record interactions
  if (action === "click" && context?.uid) {
    const actionEntry = {
      type: "cursorClick",
      uid: context.uid,
      label: context.uidLabel || null,
      role: context.uidRole || null,
    };
    if (context.bounds) actionEntry.bounds = context.bounds;
    currentScene.actions.push(actionEntry);

    if (context.uidLabel) {
      currentScene.narrationHints.push(`Click "${context.uidLabel}"`);
    }
    if (context.uid) {
      currentScene.selectors.push(context.uid);
    }
  }

  if (action === "fill" && context?.uid) {
    currentScene.actions.push({
      type: "fill",
      uid: context.uid,
      value: context.fillValue || input?.value || "",
      label: context.uidLabel || null,
    });
    if (context.uidLabel) {
      currentScene.narrationHints.push(
        `Type "${context.fillValue || input?.value}" into "${context.uidLabel}"`
      );
    }
    if (context.uid) {
      currentScene.selectors.push(context.uid);
    }
  }

  if (action === "fill-form" && input?.elements) {
    for (const el of input.elements) {
      currentScene.actions.push({
        type: "fill",
        uid: el.uid,
        value: el.value,
      });
      currentScene.selectors.push(el.uid);
    }
    currentScene.narrationHints.push("Fill out the form");
  }

  if (action === "hover" && context?.uid) {
    currentScene.actions.push({
      type: "hover",
      uid: context.uid,
      label: context.uidLabel || null,
    });
  }

  if (action === "press-key" && context?.key) {
    currentScene.actions.push({
      type: "keypress",
      key: context.key,
    });
  }

  if (action === "take-snapshot") {
    currentScene.snapshotCount++;
    // Extract page URL from snapshot if we didn't have it
    if (context?.url && !currentScene.url) {
      currentScene.url = context.url;
    }
    if (context?.viewport) {
      currentScene.viewport = context.viewport;
    }
  }

  if (action === "take-screenshot") {
    currentScene.actions.push({ type: "screenshot" });
  }

  if (action === "evaluate-script") {
    currentScene.actions.push({
      type: "eval",
      function: input?.function?.substring(0, 200) || "",
    });
  }
}

// Push the last scene
if (currentScene) {
  scenes.push(currentScene);
}

console.log(`Grouped into ${scenes.length} scenes`);

// ═══════════════════════════════════════════════════════════════════════
// Build manifest
// ═══════════════════════════════════════════════════════════════════════
const manifest = {
  name: "scout-recording",
  version: 1,
  generatedFrom: inputPath,
  generatedAt: new Date().toISOString(),
  baseUrl: extractBaseUrl(scenes),
  viewport: { width: 1920, height: 1080 },
  scenes: scenes.map((scene, i) => {
    // Estimate action cost for budget system
    const budgetActions = scene.actions.map((a) => {
      switch (a.type) {
        case "cursorClick": return { type: "cursorClick", cost: 1200 };
        case "fill": return { type: "type", text: a.value, cost: a.value.length * 200 };
        case "hover": return { type: "sleep", ms: 500, cost: 500 };
        case "keypress": return { type: "click", cost: 200 };
        case "eval": return { type: "sleep", ms: 300, cost: 300 };
        default: return { type: "sleep", ms: 200, cost: 200 };
      }
    });

    const totalCostMs = budgetActions.reduce((sum, a) => sum + a.cost, 0);

    return {
      name: scene.name || `scene-${i}`,
      url: scene.url,
      actions: scene.actions,
      selectors: [...new Set(scene.selectors)],
      narrationHints: scene.narrationHints,
      budgetActions,
      estimatedDurationSec: Math.max(5, Math.ceil(totalCostMs / 1000) + 2),
      // Narration placeholder — fill in manually or auto-generate with Claude
      narration: scene.narrationHints.length > 0
        ? [{ action: scene.name, text: `[AUTO-GENERATE: ${scene.narrationHints.join(". ")}]` }]
        : null,
    };
  }),
};

// ═══════════════════════════════════════════════════════════════════════
// Write output
// ═══════════════════════════════════════════════════════════════════════
writeFileSync(outputPath, JSON.stringify(manifest, null, 2));
console.log(`\nManifest written to: ${outputPath}`);
console.log(`\nScene summary:`);
for (const scene of manifest.scenes) {
  console.log(
    `  ${scene.name.padEnd(30)} ${scene.actions.length} actions, ~${scene.estimatedDurationSec}s, ${scene.selectors.length} selectors`
  );
}

// Also generate a selectors.json for check-selectors.mjs
const selectorsConfig = {
  baseUrl: manifest.baseUrl,
  pages: manifest.scenes
    .filter((s) => s.selectors.length > 0)
    .map((s) => ({
      path: new URL(s.url).pathname,
      selectors: s.selectors.map((uid) => `[data-uid="${uid}"]`),
    })),
};

const selectorsPath = outputPath.replace("-manifest.json", "-selectors.json")
  .replace("manifest.json", "selectors.json");
writeFileSync(selectorsPath, JSON.stringify(selectorsConfig, null, 2));
console.log(`Selectors config: ${selectorsPath}`);

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function slugify(url) {
  try {
    const path = new URL(url).pathname;
    return path
      .replace(/^\//, "")
      .replace(/\//g, "-")
      .replace(/[^a-zA-Z0-9-]/g, "")
      || "home";
  } catch {
    return "page";
  }
}

function extractBaseUrl(scenes) {
  for (const scene of scenes) {
    if (scene.url) {
      try {
        const u = new URL(scene.url);
        return `${u.protocol}//${u.host}`;
      } catch { /* continue */ }
    }
  }
  return "http://localhost:3010";
}
