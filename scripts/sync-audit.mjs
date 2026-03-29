#!/usr/bin/env node

/**
 * Sync Audit — Cross-reference narration word timing with action timeline
 *
 * Detects where narration mentions an action before/after it visually happens,
 * and outputs a corrected speed map to fix the alignment.
 *
 * Usage:
 *   node scripts/sync-audit.mjs \
 *     --timeline <recording.jsonl> \
 *     --words <word-timings.json> \
 *     --narration <narration.json> \
 *     --segment-audio <segment-audio-boundaries.json>
 *
 * Output: sync-report.json with misalignments and corrected speed map
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const args = process.argv.slice(2);
function flag(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}

const timelinePath = flag("timeline");
const wordsPath = flag("words");
const narrationPath = flag("narration");
const outputPath = flag("output") || "sync-report.json";

if (!timelinePath || !wordsPath) {
  console.error("Usage: node scripts/sync-audit.mjs --timeline <.jsonl> --words <word-timings.json> [--narration <narration.json>]");
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════
// Load data
// ═══════════════════════════════════════════════════════════════════════

// Action timeline from recording
const timelineLines = readFileSync(resolve(timelinePath), "utf8")
  .split("\n").filter(l => l.trim()).map(l => JSON.parse(l));

// Pair start/end, extract action events with element text
const actions = [];
const starts = new Map();
for (const entry of timelineLines) {
  if (entry.type === "start") starts.set(entry.id, entry);
  else if (entry.type === "end") {
    const start = starts.get(entry.id);
    if (start && start.classification === "action") {
      actions.push({
        tool: start.tool,
        offsetMs: start.offsetMs,
        endMs: entry.offsetMs,
        elementText: entry.elementText || "",
        elementTag: entry.elementTag || "",
        params: start.params || {},
      });
    }
  }
}

// Word timings from TTS alignment
const wordTimings = JSON.parse(readFileSync(resolve(wordsPath), "utf8"));

// Narration (optional)
const narration = narrationPath ? JSON.parse(readFileSync(resolve(narrationPath), "utf8")) : null;

console.log(`\n🔍 Sync Audit`);
console.log(`   Actions: ${actions.length}`);
console.log(`   Words: ${wordTimings.length}`);
console.log(`   Narration segments: ${narration?.segments?.length || 0}\n`);

// ═══════════════════════════════════════════════════════════════════════
// Build keyword → action mapping
// ═══════════════════════════════════════════════════════════════════════

// Extract keywords from action element text
const actionKeywords = actions.map(a => ({
  keyword: a.elementText.toLowerCase().split(/\s+/)[0], // First word
  fullText: a.elementText.toLowerCase(),
  actionOffsetMs: a.offsetMs,
  tool: a.tool,
})).filter(a => a.keyword.length > 2); // Skip tiny words

console.log("   Action keywords:");
for (const a of actionKeywords) {
  console.log(`     ${(a.actionOffsetMs / 1000).toFixed(1)}s → ${a.tool} "${a.fullText}"`);
}

// ═══════════════════════════════════════════════════════════════════════
// Find each keyword in the word timings (narration)
// ═══════════════════════════════════════════════════════════════════════

const matches = [];

for (const ak of actionKeywords) {
  // Find this keyword in the word timings
  const wordIdx = wordTimings.findIndex(w =>
    w.text.toLowerCase() === ak.keyword ||
    w.text.toLowerCase().startsWith(ak.keyword)
  );

  if (wordIdx >= 0) {
    const word = wordTimings[wordIdx];
    matches.push({
      keyword: ak.keyword,
      fullText: ak.fullText,
      actionMs: ak.actionOffsetMs,
      wordMs: word.startMs,
      wordText: word.text,
      tool: ak.tool,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Analyze alignment
// ═══════════════════════════════════════════════════════════════════════

console.log("\n   Alignment analysis:");
console.log("   ─────────────────────────────────────────────────────────");
console.log("   Action (recording)     Word (narration)      Delta");
console.log("   ─────────────────────────────────────────────────────────");

const misalignments = [];

for (const m of matches) {
  // The action happens at m.actionMs in the RAW recording
  // The word is spoken at m.wordMs in the narration audio
  // After speed-matching, the action should appear at approximately m.wordMs
  // The question: is it?

  const actionSec = (m.actionMs / 1000).toFixed(1);
  const wordSec = (m.wordMs / 1000).toFixed(1);
  const deltaSec = ((m.wordMs - m.actionMs) / 1000).toFixed(1);

  const status = Math.abs(m.wordMs - m.actionMs) < 3000 ? "✓" :
                 m.wordMs < m.actionMs ? "⚠️ narration early" : "⚠️ narration late";

  console.log(`   ${actionSec.padStart(6)}s "${m.fullText.substring(0, 15).padEnd(15)}" ${wordSec.padStart(6)}s "${m.wordText.padEnd(12)}" ${deltaSec.padStart(6)}s ${status}`);

  if (Math.abs(m.wordMs - m.actionMs) >= 3000) {
    misalignments.push({
      ...m,
      deltaMs: m.wordMs - m.actionMs,
      issue: m.wordMs < m.actionMs ? "narration_early" : "narration_late",
    });
  }
}

console.log("   ─────────────────────────────────────────────────────────");

if (misalignments.length === 0) {
  console.log("\n   ✅ All actions align within 3s of narration. No fixes needed.\n");
} else {
  console.log(`\n   ⚠️  ${misalignments.length} misalignment(s) detected:\n`);
  for (const m of misalignments) {
    const deltaSec = (m.deltaMs / 1000).toFixed(1);
    console.log(`   • "${m.fullText}" — narration ${m.issue === "narration_early" ? "mentions it" : "hasn't mentioned it"} ${Math.abs(deltaSec)}s ${m.issue === "narration_early" ? "before" : "after"} it appears on screen`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Generate corrected speed map
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n   Suggested speed adjustments:");
  console.log("   (slow down before early actions, speed up before late actions)\n");

  // Sort matches by action time
  const sorted = [...matches].sort((a, b) => a.actionMs - b.actionMs);

  const speedMap = [];
  let prevActionMs = 0;
  let prevWordMs = 0;

  for (const m of sorted) {
    const segDurAction = m.actionMs - prevActionMs;
    const segDurWord = m.wordMs - prevWordMs;

    if (segDurAction > 0 && segDurWord > 0) {
      const speed = segDurAction / segDurWord;
      speedMap.push({
        fromMs: prevActionMs,
        toMs: m.actionMs,
        targetDurationMs: segDurWord,
        speed: parseFloat(speed.toFixed(3)),
        keyword: m.keyword,
      });

      if (Math.abs(speed - 1.0) > 0.1) {
        console.log(`   ${(prevActionMs/1000).toFixed(1)}s → ${(m.actionMs/1000).toFixed(1)}s: ${speed.toFixed(2)}x (to sync "${m.keyword}" at ${(m.wordMs/1000).toFixed(1)}s)`);
      }
    }

    prevActionMs = m.actionMs;
    prevWordMs = m.wordMs;
  }

  // Save speed map
  const report = {
    matches,
    misalignments,
    speedMap,
    summary: {
      totalActions: actions.length,
      matchedKeywords: matches.length,
      misalignments: misalignments.length,
    },
  };

  writeFileSync(resolve(outputPath), JSON.stringify(report, null, 2));
  console.log(`\n   Report saved: ${outputPath}`);
}

console.log("");
