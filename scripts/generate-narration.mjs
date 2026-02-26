#!/usr/bin/env node

/**
 * Auto-Narration Generator
 *
 * Generates natural narration text from scout walkthrough data.
 * Uses the _meta.narrationHints from jsonl-to-scout-props.mjs (or
 * jsonl-to-remotion-props.mjs) to produce spoken narration aligned
 * to scenes.
 *
 * Two modes:
 *   - claude (default): Calls Claude API for natural, contextual narration
 *   - template: Generates formulaic narration offline (no API needed)
 *
 * Usage:
 *   node scripts/generate-narration.mjs <props.json> [output.txt]
 *   node scripts/generate-narration.mjs scout-replay-props.json --mode template
 *
 * Options (env vars):
 *   NARRATION_MODE=claude       Mode: "claude" or "template" (default: claude)
 *   ANTHROPIC_API_KEY=...       Required for claude mode
 *   NARRATION_PERSONA=...       Persona for Claude (default: professional demo narrator)
 *   NARRATION_PRODUCT=...       Product name for context (default: auto-detected)
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════════════
const MODE = process.env.NARRATION_MODE || parseFlag("mode") || "claude";
const PERSONA = process.env.NARRATION_PERSONA || "a professional, friendly product demo narrator";
const PRODUCT_NAME = process.env.NARRATION_PRODUCT || "";

// ═══════════════════════════════════════════════════════════════════════
// Parse args
// ═══════════════════════════════════════════════════════════════════════
const inputPath = process.argv.filter((a) => !a.startsWith("--"))[2];
if (!inputPath) {
  console.error("Usage: node scripts/generate-narration.mjs <props.json> [output.txt]");
  console.error("\nOptions:");
  console.error("  --mode claude|template   Narration generation mode (default: claude)");
  console.error("\nEnvironment:");
  console.error("  ANTHROPIC_API_KEY        Required for claude mode");
  console.error("  NARRATION_PERSONA        Persona style (default: professional demo narrator)");
  console.error("  NARRATION_PRODUCT        Product name for context");
  process.exit(1);
}

const outputPath = process.argv.filter((a) => !a.startsWith("--"))[3] ||
  inputPath.replace(/\.json$/, "-narration.json");

const absInput = resolve(inputPath);
if (!existsSync(absInput)) {
  console.error(`Props file not found: ${absInput}`);
  process.exit(1);
}

const props = JSON.parse(readFileSync(absInput, "utf8"));
const hints = props._meta?.narrationHints;

if (!hints || hints.length === 0) {
  console.error("No narration hints found in _meta.narrationHints — run jsonl-to-scout-props.mjs first");
  process.exit(1);
}

console.log(`Mode: ${MODE}`);
console.log(`Scenes: ${hints.length}`);
console.log(`Persona: ${PERSONA}\n`);

// ═══════════════════════════════════════════════════════════════════════
// Generate narration
// ═══════════════════════════════════════════════════════════════════════

let narration;

if (MODE === "claude") {
  narration = await generateWithClaude(hints);
} else {
  narration = generateWithTemplate(hints);
}

// ═══════════════════════════════════════════════════════════════════════
// Write output
// ═══════════════════════════════════════════════════════════════════════

writeFileSync(outputPath, JSON.stringify(narration, null, 2));
console.log(`\nNarration written to: ${outputPath}`);
console.log(`Full text (${narration.fullText.length} chars):\n`);
console.log(narration.fullText);

// Also output just the text for easy piping to TTS
const textOnlyPath = outputPath.replace(/\.json$/, ".txt");
writeFileSync(textOnlyPath, narration.fullText);
console.log(`\nPlain text: ${textOnlyPath}`);

// ═══════════════════════════════════════════════════════════════════════
// Claude mode
// ═══════════════════════════════════════════════════════════════════════

async function generateWithClaude(hints) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY not set — falling back to template mode");
    return generateWithTemplate(hints);
  }

  // Build the scene descriptions for Claude
  const sceneDescriptions = hints.map((h, i) => {
    const actions = h.actions.length > 0
      ? h.actions.join(". ")
      : "View the page";
    return `Scene ${i + 1} (${h.scene}, ~${h.durationSec.toFixed(0)}s): ${actions}`;
  }).join("\n");

  const productCtx = PRODUCT_NAME
    ? `The product being demonstrated is "${PRODUCT_NAME}".`
    : "Detect the product name from the page URLs and element labels.";

  const prompt = `You are ${PERSONA}. You are writing narration for a product demo video.

${productCtx}

Here are the scenes and what happens in each:
${sceneDescriptions}

Write narration for each scene. Requirements:
- Each scene gets 1-3 short sentences
- Natural, conversational tone — this will be read aloud by TTS
- Start with a brief intro ("Let me show you..." or "Here's how...")
- Reference specific actions naturally ("We'll click Add to Cart" not "The user clicks the button")
- Use "we" or "let's" perspective
- End with a brief wrap-up
- Keep total narration proportional to scene durations
- No markdown, no stage directions, no [brackets] — pure spoken text

Return a JSON object with:
- "segments": array of { "scene": string, "text": string, "actionKeywords": string[] } for each scene
  - actionKeywords: words/phrases from the narration text that correspond to visible actions (clicks, typing, navigation). These are used to sync cursor animations to the audio. Example: if the narration says "We'll search for Pink in the product list", actionKeywords might be ["search", "Pink"].
- "fullText": all segments joined as one continuous narration`;

  console.log("Calling Claude API for narration...");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2000,
      messages: [
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`Claude API error: ${error}`);
    console.error("Falling back to template mode");
    return generateWithTemplate(hints);
  }

  const data = await response.json();
  const text = data.content[0].text;

  // Extract JSON from response (may be wrapped in markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("Could not parse Claude response as JSON — falling back to template mode");
    console.error("Raw response:", text.substring(0, 500));
    return generateWithTemplate(hints);
  }

  try {
    const result = JSON.parse(jsonMatch[0]);
    // Ensure fullText exists
    if (!result.fullText && result.segments) {
      result.fullText = result.segments.map((s) => s.text).join(" ");
    }
    return result;
  } catch (e) {
    console.error("JSON parse failed — falling back to template mode");
    return generateWithTemplate(hints);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Template mode (offline, no API)
// ═══════════════════════════════════════════════════════════════════════

function generateWithTemplate(hints) {
  const segments = [];

  // Opening
  const productName = PRODUCT_NAME || detectProductName(hints);
  segments.push({
    scene: "intro",
    text: `Let me walk you through ${productName || "this application"}. I'll show you the key features and how everything works.`,
    actionKeywords: [],
  });

  // Per-scene narration
  for (const hint of hints) {
    const sceneName = hint.scene
      .replace(/^\//, "")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()) || "this page";

    if (hint.actions.length === 0) {
      segments.push({
        scene: hint.scene,
        text: `Here we have the ${sceneName} view.`,
        actionKeywords: [],
      });
      continue;
    }

    // Extract keywords from actions for audio-sync
    const actionKeywords = [];
    const actionTexts = hint.actions.map((action) => {
      // Parse "Click "Add to Cart" (button)" format
      const clickMatch = action.match(/^Click "([^"]+)"/);
      if (clickMatch) {
        actionKeywords.push(clickMatch[1]);
        return `we click ${clickMatch[1]}`;
      }

      // Parse "Type "value" into "label"" format
      const typeMatch = action.match(/^Type "([^"]+)" into (.+)$/);
      if (typeMatch) {
        actionKeywords.push(typeMatch[1]);
        return `we type "${typeMatch[1]}" into the ${typeMatch[2]}`;
      }

      return action.toLowerCase();
    });

    let text;
    if (actionTexts.length === 1) {
      text = `On the ${sceneName} page, ${actionTexts[0]}.`;
    } else if (actionTexts.length === 2) {
      text = `On the ${sceneName} page, ${actionTexts[0]}, then ${actionTexts[1]}.`;
    } else {
      const last = actionTexts.pop();
      text = `On the ${sceneName} page, ${actionTexts.join(", ")}, and finally ${last}.`;
    }

    segments.push({ scene: hint.scene, text, actionKeywords });
  }

  // Closing
  segments.push({
    scene: "outro",
    text: `And that's a quick overview of what ${productName || "the application"} can do. Thanks for watching!`,
    actionKeywords: [],
  });

  const fullText = segments.map((s) => s.text).join(" ");

  return { segments, fullText };
}

/**
 * Try to detect the product name from scene URLs.
 */
function detectProductName(hints) {
  for (const h of hints) {
    if (h.scene.includes("pos")) return "the POS system";
    if (h.scene.includes("admin")) return "the admin dashboard";
    if (h.scene.includes("dashboard")) return "the dashboard";
  }
  return null;
}

function parseFlag(name) {
  const flag = process.argv.find((a) => a.startsWith(`--${name}`));
  if (!flag) return null;
  if (flag.includes("=")) return flag.split("=")[1];
  const idx = process.argv.indexOf(flag);
  return process.argv[idx + 1] || null;
}
