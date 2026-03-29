#!/usr/bin/env node

/**
 * Timeline to Replay Script Converter
 *
 * Reads a screencast JSONL timeline (with real timestamps from the MCP fork)
 * and generates a replayable demo script with stable selectors and timing.
 *
 * Usage:
 *   node scripts/timeline-to-replay.mjs <timeline.jsonl> [--output replay.json]
 *
 * The output script can be used with replay-demo.mjs for instant re-recording.
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, basename, extname } from "path";

const args = process.argv.slice(2);
const timelinePath = args.find((a) => !a.startsWith("--"));
const outputFlag = args.indexOf("--output");
const outputPath =
  outputFlag >= 0 ? args[outputFlag + 1] : timelinePath.replace(/\.jsonl$/, "-replay.json");

if (!timelinePath) {
  console.error("Usage: node scripts/timeline-to-replay.mjs <timeline.jsonl> [--output replay.json]");
  process.exit(1);
}

// Parse JSONL
const lines = readFileSync(resolve(timelinePath), "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));

// Pair start/end entries
const actions = [];
const startEntries = new Map();

for (const entry of lines) {
  if (entry.type === "start") {
    startEntries.set(entry.id, entry);
  } else if (entry.type === "end") {
    const start = startEntries.get(entry.id);
    if (start) {
      actions.push({
        tool: start.tool,
        params: start.params || {},
        classification: start.classification,
        offsetMs: start.offsetMs,
        endOffsetMs: entry.offsetMs,
        durationMs: entry.durationMs,
        // Element context from enhanced logger
        elementText: entry.elementText,
        elementTag: entry.elementTag,
        elementRole: entry.elementRole,
        elementLabel: entry.elementLabel,
      });
    }
  } else if (entry.type === "marker") {
    actions.push({
      tool: "_marker",
      name: entry.name,
      offsetMs: entry.offsetMs,
    });
  } else if (entry.type?.startsWith("segment_")) {
    actions.push({
      tool: `_${entry.type}`,
      segmentIndex: entry.segmentIndex,
      offsetMs: entry.offsetMs,
    });
  }
}

// Filter to only action/loading tools (skip observe tools like take_snapshot)
const actionTools = actions.filter(
  (a) => a.classification === "action" || a.classification === "loading" || a.tool?.startsWith("_")
);

console.log(`Timeline: ${lines.length} entries → ${actionTools.length} actions`);
console.log(`Duration: ${(actions[actions.length - 1]?.offsetMs / 1000).toFixed(1)}s`);

// Build replay script
const replayActions = [];
let prevEndMs = 0;

for (const action of actionTools) {
  // Calculate delay from end of previous action to start of this one
  const delay = Math.max(0, action.offsetMs - prevEndMs);

  // Build selector from available info
  let selector = "";
  let thinking = "";

  if (action.tool === "click") {
    if (action.elementLabel) {
      selector = `aria=${action.elementLabel}`;
      thinking = `Click ${action.elementLabel}`;
    } else if (action.elementText) {
      // Use first meaningful words of element text as selector
      const text = action.elementText.split("\n")[0].trim().substring(0, 50);
      selector = `text=${text}`;
      thinking = `Click "${text}"`;
    } else if (action.params.uid) {
      selector = `uid=${action.params.uid}`;
      thinking = `Click element (UID: ${action.params.uid})`;
    }
  } else if (action.tool === "fill") {
    if (action.params.uid) {
      selector = `uid=${action.params.uid}`;
    }
    thinking = `Fill with "${action.params.value}"`;
  } else if (action.tool === "navigate_page") {
    thinking = `Navigate: ${action.params.url || action.params.type}`;
  } else if (action.tool === "wait_for") {
    thinking = `Wait for: ${JSON.stringify(action.params.text)}`;
  } else if (action.tool === "_marker") {
    replayActions.push({
      action: "marker",
      name: action.name,
      offsetMs: action.offsetMs,
    });
    continue;
  } else if (action.tool?.startsWith("_segment_")) {
    continue; // Skip segment events for now
  }

  const replayAction = {
    action: mapToolToAction(action.tool),
    delay: Math.round(delay),
    offsetMs: action.offsetMs,
    thinking,
  };

  // Add tool-specific fields
  if (selector) replayAction.selector = selector;
  if (action.tool === "fill" && action.params.value) replayAction.value = action.params.value;
  if (action.tool === "wait_for") replayAction.text = action.params.text;
  if (action.tool === "navigate_page" && action.params.url) replayAction.url = action.params.url;
  if (action.tool === "navigate_page" && action.params.type) replayAction.navigateType = action.params.type;
  if (action.tool === "evaluate_script") replayAction.code = action.params.function;

  replayActions.push(replayAction);
  prevEndMs = action.endOffsetMs || action.offsetMs;
}

function mapToolToAction(tool) {
  const map = {
    click: "click",
    fill: "fill",
    type_text: "fill",
    hover: "hover",
    navigate_page: "navigate",
    new_page: "navigate",
    wait_for: "wait",
    evaluate_script: "eval",
    press_key: "press_key",
    drag: "drag",
    scroll: "scroll",
  };
  return map[tool] || tool;
}

// Build output
const replay = {
  meta: {
    name: basename(timelinePath, extname(timelinePath)),
    description: `Auto-generated from ${basename(timelinePath)}`,
    created: new Date().toISOString().split("T")[0],
    sourceTimeline: basename(timelinePath),
    totalDurationMs: actions[actions.length - 1]?.offsetMs || 0,
    actionCount: replayActions.length,
  },
  segments: [
    {
      name: "Recording",
      actions: replayActions,
    },
  ],
};

writeFileSync(resolve(outputPath), JSON.stringify(replay, null, 2));
console.log(`\nReplay script: ${outputPath}`);
console.log(`  ${replayActions.length} actions`);
console.log(`  Total delay: ${(replayActions.reduce((s, a) => s + (a.delay || 0), 0) / 1000).toFixed(1)}s`);

// Print action summary
console.log("\nAction summary:");
for (const a of replayActions) {
  if (a.action === "marker") {
    console.log(`  📍 ${a.offsetMs / 1000}s — MARKER: ${a.name}`);
  } else {
    const delayStr = a.delay > 0 ? ` (${(a.delay / 1000).toFixed(1)}s delay)` : "";
    console.log(
      `  ${(a.offsetMs / 1000).toFixed(1)}s — ${a.action}: ${a.selector || a.url || a.text || ""}${delayStr} ${a.thinking ? `// ${a.thinking}` : ""}`
    );
  }
}
