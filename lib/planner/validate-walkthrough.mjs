#!/usr/bin/env node
/**
 * validate-walkthrough.mjs
 *
 * Compares a walkthrough JSONL (from the scout phase) against a demo-plan.json.
 * Reports scene coverage, missing scenes, and screenshot counts.
 *
 * Usage:
 *   node validate-walkthrough.mjs demo-plan.json walkthrough.jsonl
 *   node validate-walkthrough.mjs --plan demo-plan.json --walkthrough walkthrough.jsonl
 *
 * Output:
 *   Scene Coverage Report with PASS/MISS/PARTIAL for each planned scene,
 *   coverage percentage, and suggestions for re-scouting missing scenes.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// JSONL parser
// ---------------------------------------------------------------------------

function parseJSONL(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  return content
    .split('\n')
    .filter(line => line.trim())
    .map((line, i) => {
      try {
        return JSON.parse(line);
      } catch {
        console.warn(`Skipping invalid JSONL line ${i + 1}`);
        return null;
      }
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Action matching
// ---------------------------------------------------------------------------

/**
 * Check if a walkthrough entry matches a planned action.
 * We use fuzzy matching on labels, UIDs, action types, and text content.
 */
function matchesAction(entry, plannedAction) {
  const entryStr = JSON.stringify(entry).toLowerCase();
  const target = (plannedAction.target || '').toLowerCase();
  const hint = (plannedAction.selectorHint || '').toLowerCase();

  switch (plannedAction.type) {
    case 'click':
      if (entry.action !== 'click') return false;
      // Check if the target text appears anywhere in the entry
      return fuzzyMatch(entryStr, target) || fuzzyMatch(entryStr, hint);

    case 'fill':
      if (entry.action !== 'fill' && entry.action !== 'type') return false;
      return fuzzyMatch(entryStr, target) || fuzzyMatch(entryStr, hint);

    case 'screenshot':
      return entry.action === 'screenshot' || entry.type === 'screenshot';

    case 'navigate':
      return entry.action === 'navigate' || entry.action === 'goto' ||
        (entry.url && fuzzyMatch(entry.url.toLowerCase(), target));

    case 'wait':
      return entry.action === 'wait' || entry.action === 'waitForSelector';

    default:
      return fuzzyMatch(entryStr, target);
  }
}

function fuzzyMatch(haystack, needle) {
  if (!needle || needle.length < 3) return false;
  // Split needle into words and check if most appear in haystack
  const words = needle.split(/\s+/).filter(w => w.length > 2);
  if (words.length === 0) return false;
  const hits = words.filter(w => haystack.includes(w));
  return hits.length >= Math.ceil(words.length * 0.5);
}

// ---------------------------------------------------------------------------
// Scene matching
// ---------------------------------------------------------------------------

function matchScene(scene, entries) {
  const results = {
    sceneId: scene.id,
    sceneName: scene.name,
    totalActions: scene.actions.length,
    matchedActions: 0,
    screenshots: 0,
    expectedScreenshots: scene.validation.screenshotExpected,
    matchedEntries: [],
  };

  // Try to match each planned action against walkthrough entries
  for (const action of scene.actions) {
    if (action.type === 'screenshot') {
      // Count screenshots in the walkthrough
      // We can't perfectly match screenshots to specific scenes,
      // so we count total screenshots proportionally
      continue;
    }
    for (const entry of entries) {
      if (matchesAction(entry, action)) {
        results.matchedActions++;
        results.matchedEntries.push({
          action: action.target || action.type,
          matched: summarizeEntry(entry),
        });
        break; // Each planned action matches at most one entry
      }
    }
  }

  // Count screenshots (any screenshot action in the walkthrough)
  results.screenshots = entries.filter(
    e => e.action === 'screenshot' || e.type === 'screenshot'
  ).length;

  // Determine status
  const nonScreenshotActions = scene.actions.filter(a => a.type !== 'screenshot').length;
  const coverage = nonScreenshotActions > 0 ? results.matchedActions / nonScreenshotActions : 0;

  if (coverage >= 0.6) {
    results.status = 'PASS';
  } else if (coverage >= 0.3) {
    results.status = 'PARTIAL';
  } else {
    results.status = 'MISS';
  }

  results.coverage = Math.round(coverage * 100);

  return results;
}

function summarizeEntry(entry) {
  const parts = [];
  if (entry.action) parts.push(entry.action);
  if (entry.label) parts.push(`"${entry.label}"`);
  if (entry.uid) parts.push(`uid:${entry.uid}`);
  if (entry.url) parts.push(entry.url);
  return parts.join(' ') || JSON.stringify(entry).slice(0, 80);
}

// ---------------------------------------------------------------------------
// Label-based scene detection (alternative to action matching)
// ---------------------------------------------------------------------------

/**
 * Even without exact action matching, we can detect scene coverage
 * by looking for keywords from the scene name/group in walkthrough labels.
 */
function detectSceneByKeywords(scene, entries) {
  const keywords = [
    ...scene.name.toLowerCase().split(/\s+/),
    ...scene.group.toLowerCase().split(/\s+/),
    scene.id.replace(/-/g, ' ').toLowerCase(),
  ].filter(w => w.length > 3);

  const uniqueKeywords = [...new Set(keywords)];

  let hits = 0;
  for (const kw of uniqueKeywords) {
    const found = entries.some(e => {
      const text = (e.label || e.text || e.context || JSON.stringify(e)).toLowerCase();
      return text.includes(kw);
    });
    if (found) hits++;
  }

  return uniqueKeywords.length > 0 ? hits / uniqueKeywords.length : 0;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);

  let planPath = null;
  let walkthroughPath = null;
  let verbose = false;

  // Parse args — support both positional and flag-based
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--plan': planPath = args[++i]; break;
      case '--walkthrough': walkthroughPath = args[++i]; break;
      case '--verbose': case '-v': verbose = true; break;
      default:
        if (!planPath) planPath = args[i];
        else if (!walkthroughPath) walkthroughPath = args[i];
    }
  }

  if (!planPath || !walkthroughPath) {
    console.error('Usage: node validate-walkthrough.mjs <demo-plan.json> <walkthrough.jsonl>');
    console.error('       node validate-walkthrough.mjs --plan demo-plan.json --walkthrough walkthrough.jsonl');
    process.exit(1);
  }

  if (!existsSync(planPath)) {
    console.error(`Plan not found: ${planPath}`);
    process.exit(1);
  }
  if (!existsSync(walkthroughPath)) {
    console.error(`Walkthrough not found: ${walkthroughPath}`);
    process.exit(1);
  }

  const plan = JSON.parse(readFileSync(planPath, 'utf-8'));
  const entries = parseJSONL(walkthroughPath);

  console.log(`Plan: ${plan.scenes.length} scenes, ~${plan.summary.totalDuration}s`);
  console.log(`Walkthrough: ${entries.length} entries`);
  console.log('');

  // Validate each scene
  const results = [];
  for (const scene of plan.scenes) {
    const result = matchScene(scene, entries);

    // Supplement with keyword detection if action matching was weak
    if (result.status === 'MISS') {
      const keywordCoverage = detectSceneByKeywords(scene, entries);
      if (keywordCoverage >= 0.4) {
        result.status = 'PARTIAL';
        result.coverage = Math.max(result.coverage, Math.round(keywordCoverage * 100));
        result.note = 'Detected by keyword matching';
      }
    }

    results.push(result);
  }

  // Print report
  console.log('Scene Coverage Report:');
  console.log('─'.repeat(70));

  const statusIcon = { PASS: '\x1b[32m[PASS]\x1b[0m', PARTIAL: '\x1b[33m[PART]\x1b[0m', MISS: '\x1b[31m[MISS]\x1b[0m' };

  for (const r of results) {
    const icon = statusIcon[r.status];
    const screenshots = `${r.screenshots} screenshots`;
    console.log(`  ${icon} ${r.sceneName} — ${r.coverage}% coverage (${screenshots})`);

    if (verbose && r.matchedEntries.length > 0) {
      for (const me of r.matchedEntries) {
        console.log(`        ✓ ${me.action} → ${me.matched}`);
      }
    }
    if (r.note) {
      console.log(`        ℹ ${r.note}`);
    }
  }

  console.log('─'.repeat(70));

  const passed = results.filter(r => r.status === 'PASS').length;
  const partial = results.filter(r => r.status === 'PARTIAL').length;
  const missed = results.filter(r => r.status === 'MISS').length;
  const total = results.length;

  console.log(`\nCoverage: ${passed}/${total} scenes passed (${partial} partial, ${missed} missing)`);
  console.log(`Overall: ${Math.round(((passed + partial * 0.5) / total) * 100)}%`);

  if (missed > 0) {
    console.log(`\nMissing scenes to re-scout:`);
    for (const r of results.filter(r => r.status === 'MISS')) {
      const scene = plan.scenes.find(s => s.id === r.sceneId);
      console.log(`  - ${r.sceneName} (${scene?.group || 'unknown group'})`);
      if (scene?.narrationGoal) {
        console.log(`    Goal: ${scene.narrationGoal}`);
      }
    }
  }

  // Exit code: 0 if >= 70% coverage, 1 otherwise
  const overallPct = ((passed + partial * 0.5) / total) * 100;
  process.exit(overallPct >= 70 ? 0 : 1);
}

main();
