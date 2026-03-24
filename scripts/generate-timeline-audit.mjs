#!/usr/bin/env node

/**
 * Timeline Audit
 *
 * Generates a machine-readable timeline that maps scene transitions to
 * narration words, making it trivial for an AI to verify alignment.
 *
 * Output format (JSON):
 * {
 *   scenes: [
 *     {
 *       id: 1,
 *       startSec: 0.2,
 *       endSec: 5.9,
 *       imageBefore: "real-gasgang-no-flavours.png",
 *       imageAfter: "real-gasgang-no-flavours.png",
 *       crossfadeAtSec: 3.6,
 *       lowerThird: null,
 *       words: [
 *         { text: "Go", sec: 0.2 },
 *         { text: "to", sec: 0.3 },
 *         ...
 *       ],
 *       narrationPreview: "Go to any store website right now..."
 *     }
 *   ],
 *   issues: [
 *     "Scene 2 shows 'Drizzle' image at 5.9s but 'Drizzle' isn't spoken until 13.6s"
 *   ]
 * }
 *
 * Usage:
 *   node scripts/generate-timeline-audit.mjs <props.json> [word-timings.json]
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FPS = 30;

const propsPath = process.argv[2];
if (!propsPath) {
  console.error("Usage: node scripts/generate-timeline-audit.mjs <props.json> [word-timings.json]");
  process.exit(1);
}

const props = JSON.parse(readFileSync(resolve(propsPath), "utf8"));
const wordTimings = props.wordTimings || [];

const TRANSITION_FRAMES = 15;
const introSec = (props.introDurationFrames || 90) / FPS;
const contentStartSec = introSec - TRANSITION_FRAMES / FPS;

// Build scene timeline
const timeline = [];
let sceneStartFrame = 0;

for (let i = 0; i < props.scenes.length; i++) {
  const scene = props.scenes[i];
  const startSec = scene.audioOffsetMs / 1000;
  const durationSec = scene.durationFrames / FPS;
  const endSec = startSec + durationSec;
  const crossfadeSec = startSec + durationSec * 0.6; // ScoutReplay crossfades at ~60%

  // Find words that fall within this scene's time range
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
    firstWord: sceneWords[0] || null,
    lastWord: sceneWords[sceneWords.length - 1] || null,
    narrationPreview: narrationPreview.length > 120 ? narrationPreview.substring(0, 120) + "..." : narrationPreview,
    words: sceneWords,
  });
}

// Auto-detect issues
const issues = [];

for (let i = 0; i < timeline.length; i++) {
  const scene = timeline[i];

  // Issue: scene has no words (audio not aligned)
  if (scene.wordCount === 0) {
    issues.push(`Scene ${scene.id}: NO WORDS — audio may not be aligned to this scene`);
  }

  // Issue: image name suggests content that doesn't match narration timing
  // Check if the "before" image name contains a keyword that appears later in the narration
  const beforeImg = scene.imageBefore.toLowerCase();
  const afterImg = scene.imageAfter.toLowerCase();

  // Check if crossfade image content is mentioned before the crossfade point
  if (beforeImg !== afterImg) {
    // Extract potential product/brand keywords from image filenames
    const imgKeywords = extractKeywords(afterImg);
    for (const keyword of imgKeywords) {
      // Find first mention of this keyword in the scene's words
      const firstMention = scene.words.find(
        (w) => w.text.toLowerCase().replace(/[.,!?]/g, "") === keyword
      );
      if (firstMention && firstMention.sec < scene.crossfadeAtSec) {
        // The word is spoken BEFORE the crossfade — image should already be showing
        const delta = scene.crossfadeAtSec - firstMention.sec;
        if (delta > 3) {
          issues.push(
            `Scene ${scene.id}: "${keyword}" spoken at ${firstMention.sec}s but image "${scene.imageAfter}" doesn't appear until crossfade at ${scene.crossfadeAtSec}s (${delta.toFixed(1)}s late)`
          );
        }
      }
    }
  }

  // Issue: scene image suggests wrong content for the narration
  const beforeKeywords = extractKeywords(beforeImg);
  for (const keyword of beforeKeywords) {
    // Check if this keyword is NOT in this scene's narration but IS in another scene
    const inThisScene = scene.words.some(
      (w) => w.text.toLowerCase().replace(/[.,!?]/g, "").includes(keyword)
    );
    if (!inThisScene && keyword.length > 4) {
      // Check if another scene talks about this
      const otherScene = timeline.find(
        (s) => s.id !== scene.id && s.words.some((w) => w.text.toLowerCase().replace(/[.,!?]/g, "").includes(keyword))
      );
      if (otherScene) {
        issues.push(
          `Scene ${scene.id}: shows image containing "${keyword}" but that word appears in scene ${otherScene.id}'s narration, not this one`
        );
      }
    }
  }
}

// Check for audio cutoff
const lastWord = wordTimings[wordTimings.length - 1];
const lastScene = timeline[timeline.length - 1];
if (lastWord && lastScene) {
  const audioEndSec = lastWord.endMs / 1000;
  if (lastScene.endSec < audioEndSec) {
    issues.push(
      `AUDIO CUTOFF: last word ends at ${audioEndSec.toFixed(1)}s but last scene ends at ${lastScene.endSec.toFixed(1)}s — audio will be clipped by ${(audioEndSec - lastScene.endSec).toFixed(1)}s`
    );
  }
}

const audit = { scenes: timeline, issues };

// Output
const outputPath = propsPath.replace(/\.json$/, "-timeline-audit.json");
writeFileSync(outputPath, JSON.stringify(audit, null, 2));

// Print summary
console.log("Timeline Audit");
console.log("══════════════════════════════════════════\n");
for (const scene of timeline) {
  const img = scene.imageBefore === scene.imageAfter
    ? scene.imageBefore.replace("screenshots/", "")
    : `${scene.imageBefore.replace("screenshots/", "")} → ${scene.imageAfter.replace("screenshots/", "")}`;
  console.log(`Scene ${scene.id} [${scene.startSec}s - ${scene.endSec}s] (${scene.durationSec}s)`);
  console.log(`  Image: ${img}`);
  if (scene.imageBefore !== scene.imageAfter) {
    console.log(`  Crossfade at: ${scene.crossfadeAtSec}s`);
  }
  if (scene.lowerThird) console.log(`  Lower third: "${scene.lowerThird}"`);
  console.log(`  Words: ${scene.wordCount} | "${scene.narrationPreview}"`);
  console.log("");
}

if (issues.length > 0) {
  console.log("ISSUES FOUND:");
  for (const issue of issues) {
    console.log(`  ⚠ ${issue}`);
  }
} else {
  console.log("✓ No issues detected");
}

console.log(`\nAudit saved: ${outputPath}`);

// ═══════════════════════════════════════════════════════════════════════

function extractKeywords(filename) {
  return filename
    .replace(/screenshots\//, "")
    .replace(/scene-\d+-?/, "")
    .replace(/\.(png|jpg)/, "")
    .split(/[-_.]/)
    .filter((w) => w.length > 2)
    .map((w) => w.toLowerCase());
}
