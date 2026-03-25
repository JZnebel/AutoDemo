#!/usr/bin/env node

/**
 * Screencast Timeline Audit
 *
 * Maps narration segments against the edited video timeline to check
 * if what the narrator says matches what's on screen at that moment.
 *
 * Inputs:
 *   - timeline JSONL (raw tool call timestamps)
 *   - edit list from video-editor (how raw time maps to edited time)
 *   - narration.json (segments with text)
 *   - word-timings.json (Whisper word-level timestamps)
 *
 * Output: JSON audit with side-by-side alignment + issues list
 *
 * Usage:
 *   node scripts/screencast-audit.mjs <screencast-output-dir>
 *   node scripts/screencast-audit.mjs screencast-output/
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const FPS = 30;
const dir = resolve(process.argv[2] || "screencast-output");

// ─── Load inputs ─────────────────────────────────────────────────────

function loadJSON(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function loadJSONL(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

// Find the timeline JSONL — check output dir and final-output
const timelinePaths = [
  join(dir, "timeline.jsonl"),
  // Also check sibling to the recording
  resolve("final-output/trafficstores-demo.jsonl"),
];
// Auto-detect from narration hints which might reference the original
let timelinePath = timelinePaths.find(existsSync);

// Broader search: any .jsonl in final-output
if (!timelinePath) {
  const { readdirSync } = await import("fs");
  try {
    const files = readdirSync(resolve("final-output")).filter((f) => f.endsWith(".jsonl"));
    if (files.length > 0) timelinePath = resolve("final-output", files[0]);
  } catch {}
}

const narration = loadJSON(join(dir, "narration.json"));
const wordTimings = loadJSON(join(dir, "word-timings.json")) || [];
const props = loadJSON(join(dir, "screencast-props.json"));
const rawTimeline = timelinePath ? loadJSONL(timelinePath) : [];

if (!narration) {
  console.error("No narration.json found in", dir);
  process.exit(1);
}

console.log("Screencast Timeline Audit");
console.log("═".repeat(50));
console.log(`  Dir: ${dir}`);
console.log(`  Timeline: ${timelinePath || "not found"}`);
console.log(`  Narration: ${narration.segments?.length || 0} segments, ${narration.fullText?.length || 0} chars`);
console.log(`  Word timings: ${wordTimings.length} words`);
console.log("");

// ─── Build raw action timeline ───────────────────────────────────────

const SKIP_TOOLS = new Set([
  "take_snapshot", "take_screenshot", "list_pages", "evaluate_script",
  "screencast_start", "screencast_stop", "select_page", "new_page",
]);

const actions = rawTimeline
  .filter((e) => e.type === "start" && !SKIP_TOOLS.has(e.tool))
  .map((e) => ({
    tool: e.tool,
    params: e.params || {},
    classification: e.classification,
    rawOffsetMs: e.offsetMs,
    description: describeAction(e.tool, e.params || {}),
  }));

function describeAction(tool, params) {
  switch (tool) {
    case "click": return "Click";
    case "fill": return `Type "${(params.value || "").substring(0, 40)}"`;
    case "type_text": return `Type "${(params.text || "").substring(0, 40)}"`;
    case "wait_for": return "Page loads";
    case "navigate_page": return `Navigate ${params.type || ""}`;
    case "hover": return "Hover";
    case "press_key": return `Press ${params.key || "key"}`;
    default: return tool;
  }
}

// ─── Build edited timeline mapping ───────────────────────────────────
// The video editor applies speed ramps. We need to approximate what
// raw timestamp maps to what edited timestamp.

// Load edit list if available (from video-editor output)
// For now, rebuild it from the same logic the editor uses
const { parseTimeline, buildEditList } = await import(join(resolve("."), "lib", "video-editor.mjs")).catch(() => ({ parseTimeline: null, buildEditList: null }));

let editMap = null;
if (parseTimeline && buildEditList && timelinePath) {
  try {
    const segments = parseTimeline(timelinePath);
    const editList = buildEditList(segments, { speedLoading: 6, cutThreshold: 3000 });

    // Build a mapping function: rawMs → editedMs
    let editedCursor = 0;
    const mappingSegments = [];
    for (const seg of editList) {
      if (seg.outputSpeed === 0) continue; // cut
      const rawDur = seg.inputEndMs - seg.inputStartMs;
      const editedDur = rawDur / seg.outputSpeed;
      mappingSegments.push({
        rawStartMs: seg.inputStartMs,
        rawEndMs: seg.inputEndMs,
        editedStartMs: editedCursor,
        editedEndMs: editedCursor + editedDur,
        speed: seg.outputSpeed,
      });
      editedCursor += editedDur;
    }
    editMap = mappingSegments;
  } catch {}
}

function rawToEdited(rawMs) {
  if (!editMap) return rawMs; // no edit info, assume 1:1
  for (const seg of editMap) {
    if (rawMs >= seg.rawStartMs && rawMs <= seg.rawEndMs) {
      const progress = (rawMs - seg.rawStartMs) / (seg.rawEndMs - seg.rawStartMs);
      return seg.editedStartMs + progress * (seg.editedEndMs - seg.editedStartMs);
    }
  }
  // Past the last segment
  const last = editMap[editMap.length - 1];
  if (last) return last.editedEndMs + (rawMs - last.rawEndMs);
  return rawMs;
}

// ─── Map actions to edited timeline ──────────────────────────────────

const editedActions = actions.map((a) => ({
  ...a,
  editedOffsetMs: Math.round(rawToEdited(a.rawOffsetMs)),
  editedOffsetSec: +(rawToEdited(a.rawOffsetMs) / 1000).toFixed(1),
}));

// ─── Map narration to edited timeline ────────────────────────────────
// Word timings are relative to the narration audio start.
// In the final video, narration starts when the video starts (after intro).

const introSec = (props?.introDurationFrames || 90) / FPS;

const narrationSegments = (narration.segments || []).map((seg, i) => {
  // Find start time of this segment's first words in word timings
  const firstWords = seg.text.split(/\s+/).slice(0, 3).map((w) => w.toLowerCase().replace(/[^a-z]/g, ""));
  let startMs = null;

  for (let wi = 0; wi < wordTimings.length - 2; wi++) {
    const wt = wordTimings[wi];
    const norm = (wt.text || "").toLowerCase().replace(/[^a-z]/g, "");
    if (norm === firstWords[0] || norm.startsWith(firstWords[0]?.substring(0, 4) || "xxx")) {
      // Check next word too
      const next = wordTimings[wi + 1];
      const nextNorm = (next?.text || "").toLowerCase().replace(/[^a-z]/g, "");
      if (firstWords.length < 2 || nextNorm === firstWords[1] || nextNorm.startsWith(firstWords[1]?.substring(0, 4) || "xxx")) {
        startMs = wt.startMs;
        break;
      }
    }
  }

  // Fallback: estimate from segment index
  if (startMs === null && wordTimings.length > 0) {
    const totalMs = wordTimings[wordTimings.length - 1].endMs;
    startMs = Math.round((i / narration.segments.length) * totalMs);
  }

  return {
    index: i,
    text: seg.text,
    label: seg.sceneLabel,
    narrationStartMs: startMs,
    narrationStartSec: startMs !== null ? +(startMs / 1000).toFixed(1) : null,
    // In the video, narration plays from the start of the video content
    videoTimeSec: startMs !== null ? +((startMs / 1000) + introSec).toFixed(1) : null,
  };
});

// ─── Build alignment table ───────────────────────────────────────────

console.log("ALIGNMENT TABLE");
console.log("─".repeat(90));
console.log(`${"Video Time".padEnd(12)} ${"On Screen".padEnd(40)} ${"Narration".padEnd(40)}`);
console.log("─".repeat(90));

// Merge actions and narration into a unified timeline sorted by video time
const allEvents = [];

for (const a of editedActions) {
  const videoSec = +(a.editedOffsetSec + introSec).toFixed(1);
  allEvents.push({
    videoSec,
    type: "screen",
    description: a.description,
    classification: a.classification,
  });
}

for (const n of narrationSegments) {
  if (n.videoTimeSec !== null) {
    allEvents.push({
      videoSec: n.videoTimeSec,
      type: "narration",
      description: n.text.substring(0, 60) + (n.text.length > 60 ? "..." : ""),
      label: n.label,
    });
  }
}

allEvents.sort((a, b) => a.videoSec - b.videoSec);

for (const ev of allEvents) {
  const time = `${ev.videoSec.toFixed(1)}s`.padEnd(12);
  if (ev.type === "screen") {
    const marker = ev.classification === "action" ? "▶" : "⏳";
    console.log(`${time} ${marker} ${ev.description.padEnd(38)}   .`);
  } else {
    const label = ev.label ? `[${ev.label}] ` : "";
    console.log(`${time} ${"·".padEnd(40)} 🗣 ${label}${ev.description}`);
  }
}

console.log("─".repeat(90));

// ─── Issue detection ─────────────────────────────────────────────────

const issues = [];

// Check each narration segment — does it mention something that's already passed on screen?
for (const seg of narrationSegments) {
  if (seg.videoTimeSec === null) continue;

  const text = seg.text.toLowerCase();

  // Find what's on screen when this narration plays
  const screenAtTime = editedActions.filter(
    (a) => a.editedOffsetSec + introSec <= seg.videoTimeSec + 2 &&
           a.editedOffsetSec + introSec >= seg.videoTimeSec - 5
  );

  // Check for "click" narration when no click is happening
  if (text.includes("click") && !screenAtTime.some((a) => a.tool === "click")) {
    // Find when the nearest click actually happens
    const nearestClick = editedActions
      .filter((a) => a.tool === "click")
      .map((a) => ({ ...a, delta: Math.abs((a.editedOffsetSec + introSec) - seg.videoTimeSec) }))
      .sort((a, b) => a.delta - b.delta)[0];

    if (nearestClick && nearestClick.delta > 3) {
      issues.push(
        `Narration says "${seg.text.substring(0, 50)}..." at ${seg.videoTimeSec}s ` +
        `but nearest click is at ${(nearestClick.editedOffsetSec + introSec).toFixed(1)}s ` +
        `(${nearestClick.delta.toFixed(1)}s off)`
      );
    }
  }

  // Check for "type" narration when no fill is happening
  if ((text.includes("type") || text.includes("fill in")) && !screenAtTime.some((a) => a.tool === "fill" || a.tool === "type_text")) {
    const nearestFill = editedActions
      .filter((a) => a.tool === "fill" || a.tool === "type_text")
      .map((a) => ({ ...a, delta: Math.abs((a.editedOffsetSec + introSec) - seg.videoTimeSec) }))
      .sort((a, b) => a.delta - b.delta)[0];

    if (nearestFill && nearestFill.delta > 3) {
      issues.push(
        `Narration mentions typing at ${seg.videoTimeSec}s ` +
        `but nearest fill is at ${(nearestFill.editedOffsetSec + introSec).toFixed(1)}s ` +
        `(${nearestFill.delta.toFixed(1)}s off)`
      );
    }
  }
}

// Check if narration is longer than video
const editedDurationSec = props?.videoDurationFrames ? props.videoDurationFrames / FPS : 0;
const totalVideoSec = introSec + editedDurationSec + (props?.outroDurationFrames || 90) / FPS;
const narrationEndSec = wordTimings.length > 0 ? wordTimings[wordTimings.length - 1].endMs / 1000 : 0;

if (narrationEndSec > totalVideoSec) {
  issues.push(
    `Narration (${narrationEndSec.toFixed(1)}s) is longer than video (${totalVideoSec.toFixed(1)}s) — audio will be clipped`
  );
}

if (narrationEndSec > 0 && narrationEndSec < editedDurationSec * 0.5) {
  issues.push(
    `Narration (${narrationEndSec.toFixed(1)}s) covers less than half the video (${editedDurationSec.toFixed(1)}s) — long silence at end`
  );
}

// ─── Print issues ────────────────────────────────────────────────────

console.log("");
if (issues.length === 0) {
  console.log("✅ No alignment issues detected");
} else {
  console.log(`⚠️  ${issues.length} issue(s) found:`);
  for (const issue of issues) {
    console.log(`  • ${issue}`);
  }
}

// ─── Write audit file ────────────────────────────────────────────────

const audit = {
  editedActions: editedActions.map((a) => ({
    tool: a.tool,
    description: a.description,
    rawOffsetSec: +(a.rawOffsetMs / 1000).toFixed(1),
    editedOffsetSec: a.editedOffsetSec,
    videoTimeSec: +(a.editedOffsetSec + introSec).toFixed(1),
  })),
  narrationSegments,
  editMap: editMap?.map((seg) => ({
    rawStartSec: +(seg.rawStartMs / 1000).toFixed(1),
    rawEndSec: +(seg.rawEndMs / 1000).toFixed(1),
    editedStartSec: +(seg.editedStartMs / 1000).toFixed(1),
    editedEndSec: +(seg.editedEndMs / 1000).toFixed(1),
    speed: seg.speed,
  })),
  issues,
  summary: {
    rawDurationSec: editMap ? +(editMap[editMap.length - 1]?.rawEndMs / 1000).toFixed(1) : null,
    editedDurationSec: +editedDurationSec.toFixed(1),
    narrationDurationSec: +narrationEndSec.toFixed(1),
    totalVideoSec: +totalVideoSec.toFixed(1),
    actionCount: editedActions.length,
    narrationSegmentCount: narrationSegments.length,
    wordCount: wordTimings.length,
    issueCount: issues.length,
  },
};

const auditPath = join(dir, "screencast-audit.json");
writeFileSync(auditPath, JSON.stringify(audit, null, 2));
console.log(`\nAudit written: ${auditPath}`);
