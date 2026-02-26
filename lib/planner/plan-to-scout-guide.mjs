#!/usr/bin/env node
/**
 * plan-to-scout-guide.mjs
 *
 * Converts a demo-plan.json into a structured scout guide that tells Claude
 * exactly what to explore, in what order, and what screenshots to take.
 *
 * The output is a markdown file designed to be injected as context into a
 * Claude Code session running the /demo slash command.
 *
 * Usage:
 *   node plan-to-scout-guide.mjs demo-plan.json [--output scout-guide.md]
 *   node plan-to-scout-guide.mjs demo-plan.json --format json
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname, join } from 'path';

const args = process.argv.slice(2);
let planPath = null;
let outputPath = null;
let format = 'markdown';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--output' || args[i] === '-o') outputPath = args[++i];
  else if (args[i] === '--format') format = args[++i];
  else if (!planPath) planPath = args[i];
}

if (!planPath) {
  console.error('Usage: node plan-to-scout-guide.mjs <demo-plan.json> [--output scout-guide.md]');
  process.exit(1);
}

const plan = JSON.parse(readFileSync(resolve(planPath), 'utf-8'));

if (format === 'json') {
  const guide = buildJsonGuide(plan);
  const out = outputPath || planPath.replace(/\.json$/, '-scout-guide.json');
  writeFileSync(out, JSON.stringify(guide, null, 2));
  console.log(`Scout guide (JSON): ${out}`);
} else {
  const guide = buildMarkdownGuide(plan);
  const out = outputPath || planPath.replace(/\.json$/, '-scout-guide.md');
  writeFileSync(out, guide);
  console.log(`Scout guide (Markdown): ${out}`);
}

// ---------------------------------------------------------------------------
// JSON guide — structured data for programmatic consumption
// ---------------------------------------------------------------------------

function buildJsonGuide(plan) {
  return {
    version: '1.0',
    generatedFrom: planPath,
    totalScenes: plan.scenes.length,
    estimatedDuration: plan.parameters.actualDuration,
    scenes: plan.scenes.map(scene => ({
      order: scene.order,
      name: scene.name,
      group: scene.group,
      narrationGoal: scene.narrationGoal,
      actions: scene.actions
        .filter(a => a.type !== 'screenshot')
        .map(a => ({
          type: a.type,
          description: a.target,
          hint: a.selectorHint,
        })),
      screenshotsNeeded: scene.validation.screenshotExpected,
      successIndicator: scene.validation.successIndicator,
    })),
  };
}

// ---------------------------------------------------------------------------
// Markdown guide — human/LLM readable instructions
// ---------------------------------------------------------------------------

function buildMarkdownGuide(plan) {
  const lines = [];

  lines.push('# Scout Guide');
  lines.push('');
  lines.push(`**Target duration:** ~${plan.parameters.actualDuration}s | **Scenes:** ${plan.scenes.length} | **Audience:** ${plan.parameters.audience}`);
  lines.push('');
  lines.push(`**Story arc:** ${plan.storyArc}`);
  lines.push('');
  lines.push('## Instructions');
  lines.push('');
  lines.push('Walk through each scene below in order. For each scene:');
  lines.push('1. Navigate to the relevant page/section');
  lines.push('2. Perform the listed actions (click, fill, navigate)');
  lines.push('3. Take a screenshot after each significant visual change');
  lines.push('4. Move to the next scene');
  lines.push('');
  lines.push('The walkthrough hook will automatically log all your Chrome DevTools actions to `walkthrough.jsonl`.');
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const scene of plan.scenes) {
    lines.push(`## Scene ${scene.order}: ${scene.name}`);
    lines.push(`> **Group:** ${scene.group} | **~${scene.estimatedDuration}s** | **Goal:** ${scene.narrationGoal}`);
    lines.push('');

    const actions = scene.actions.filter(a => a.type !== 'screenshot');
    if (actions.length > 0) {
      lines.push('**Actions:**');
      for (const action of actions) {
        const verb = action.type === 'click' ? 'Click' :
                     action.type === 'fill' ? 'Type into' :
                     action.type === 'navigate' ? 'Navigate to' :
                     action.type === 'scan' ? 'Scan' :
                     action.type === 'wait' ? 'Wait for' :
                     'Do';
        lines.push(`- ${verb}: ${action.target}`);
      }
      lines.push('');
    }

    if (scene.narrationHints.length > 0) {
      lines.push('**Key points to demonstrate:**');
      for (const hint of scene.narrationHints.slice(0, 3)) {
        lines.push(`- ${hint}`);
      }
      lines.push('');
    }

    lines.push(`**Screenshot after:** ${scene.validation.successIndicator}`);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}
