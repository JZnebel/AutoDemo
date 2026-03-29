#!/usr/bin/env node

/**
 * Replay Demo — Execute a recorded demo script with configurable timing
 *
 * Reads a JSON action script and replays it in a connected Chrome browser,
 * recording a screencast. Actions use stable text/CSS selectors instead of
 * ephemeral UIDs.
 *
 * Usage:
 *   node scripts/replay-demo.mjs <script.json> [flags]
 *
 * Flags:
 *   --speed <multiplier>       Speed up/slow down all delays (default: 1.0)
 *   --output <path>            Output video path (default: replay-output.mp4)
 *   --no-record                Skip screencast recording (dry run)
 *   --viewport <WxH>           Viewport size (default: 1920x1080)
 *   --browser-url <url>        Chrome debugging URL (default: auto-detect)
 *
 * Script Format:
 *   {
 *     "meta": { "name": "Platform Demo", "description": "..." },
 *     "segments": [
 *       {
 *         "name": "Clothing Store",
 *         "setup": [ ... actions to prepare (not recorded) ... ],
 *         "actions": [
 *           {
 *             "action": "click",
 *             "selector": "text=Women's",
 *             "delay": 2000,
 *             "thinking": "Browse Women's category to show filtered products"
 *           },
 *           ...
 *         ]
 *       }
 *     ]
 *   }
 *
 * Selector types:
 *   "text=Add to Cart"          — Find element containing this text
 *   "css=.sf-btn-primary"       — CSS selector
 *   "aria=Seat Table"           — Aria label match
 *   "xpath=//button[text()='X']" — XPath
 *
 * Action types:
 *   click     — Click an element (selector required)
 *   fill      — Type into an input (selector + value required)
 *   scroll    — Scroll the page (scrollY value)
 *   navigate  — Go to a URL (url required)
 *   wait      — Wait for text to appear (text required, array of strings)
 *   eval      — Execute JavaScript (code required)
 *   delay     — Just wait (delay in ms)
 *   screenshot — Take a debug screenshot (path optional)
 */

import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname, basename, extname, join } from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════════════════════════════
// Parse CLI args
// ═══════════════════════════════════════════════════════════════════════
const args = process.argv.slice(2);
const scriptPath = args.find((a) => !a.startsWith("--"));

if (!scriptPath) {
  console.error("Usage: node scripts/replay-demo.mjs <script.json> [flags]");
  process.exit(1);
}

function parseFlag(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}

const speedMultiplier = parseFloat(parseFlag("speed") || "1.0");
const outputPath = parseFlag("output") || "replay-output.mp4";
const noRecord = args.includes("--no-record");
const viewportStr = parseFlag("viewport") || "1920x1080";
const browserUrl = parseFlag("browser-url");

const [vpWidth, vpHeight] = viewportStr.split("x").map(Number);

// ═══════════════════════════════════════════════════════════════════════
// Load script
// ═══════════════════════════════════════════════════════════════════════
const script = JSON.parse(readFileSync(resolve(scriptPath), "utf8"));
console.log(`\n🎬 Replay: ${script.meta?.name || scriptPath}`);
console.log(`   ${script.segments?.length || 0} segments`);
console.log(`   Speed: ${speedMultiplier}x`);
console.log(`   Output: ${outputPath}\n`);

// ═══════════════════════════════════════════════════════════════════════
// Connect to Chrome
// ═══════════════════════════════════════════════════════════════════════
let launchedBrowser = null;

async function findChrome() {
  if (browserUrl) return browserUrl;

  // Try common debugging endpoints
  const endpoints = [
    "http://127.0.0.1:9222",
    "http://127.0.0.1:9223",
    "http://localhost:9222",
  ];

  for (const ep of endpoints) {
    try {
      const resp = await fetch(`${ep}/json/version`);
      const data = await resp.json();
      console.log(`   Found Chrome: ${data.Browser}`);
      return data.webSocketDebuggerUrl;
    } catch {}
  }

  // No Chrome found — launch one
  console.log("   No Chrome debugging endpoint found. Launching Chrome...");
  const chromePath = execSync("which google-chrome || which chromium-browser || which chromium", { encoding: "utf8" }).trim();

  launchedBrowser = await puppeteer.launch({
    executablePath: chromePath,
    headless: false,
    args: [
      `--window-size=${vpWidth},${vpHeight}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-infobars",
    ],
    defaultViewport: { width: vpWidth, height: vpHeight },
  });

  console.log(`   Launched Chrome: ${chromePath}`);
  return null; // Signal to use launchedBrowser directly
}

// ═══════════════════════════════════════════════════════════════════════
// Selector resolution — find elements by text, CSS, aria, xpath
// ═══════════════════════════════════════════════════════════════════════
async function findElement(page, selector) {
  if (selector.startsWith("text=")) {
    const text = selector.slice(5);
    // Try exact text match first, then contains
    const el = await page.evaluateHandle((t) => {
      // Try buttons, links, headings, spans, labels, divs
      const candidates = document.querySelectorAll(
        'button, a, h1, h2, h3, h4, span, label, div, input, [role="button"], [role="tab"], [role="menuitem"]'
      );
      for (const el of candidates) {
        const match = el.textContent.trim() === t || el.textContent.trim().startsWith(t)
          || (el.tagName === 'INPUT' && (el.value === t || el.getAttribute('value') === t));
        if (match) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) return el;
        }
      }
      // Fallback: any element containing the text
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null
      );
      while (walker.nextNode()) {
        if (walker.currentNode.textContent.trim().includes(t)) {
          const parent = walker.currentNode.parentElement;
          if (parent) {
            const rect = parent.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) return parent;
          }
        }
      }
      return null;
    }, text);
    return el;
  } else if (selector.startsWith("css=")) {
    return page.$(selector.slice(4));
  } else if (selector.startsWith("aria=")) {
    const label = selector.slice(5);
    return page.evaluateHandle((l) => {
      return document.querySelector(`[aria-label="${l}"], [aria-label*="${l}"]`);
    }, label);
  } else if (selector.startsWith("xpath=")) {
    const [el] = await page.$x(selector.slice(6));
    return el;
  } else {
    // Default: try as text, then CSS
    const byText = await findElement(page, `text=${selector}`);
    if (byText && (await byText.evaluate((e) => e !== null))) return byText;
    return page.$(selector);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Action executor
// ═══════════════════════════════════════════════════════════════════════
async function executeAction(page, action, segmentName) {
  const delay = Math.round((action.delay || 0) / speedMultiplier);

  // Pre-action delay
  if (delay > 0) {
    await new Promise((r) => setTimeout(r, delay));
  }

  const label = action.thinking
    ? `${action.action}: ${action.thinking.substring(0, 60)}`
    : `${action.action}: ${action.selector || action.url || action.text || ""}`;

  switch (action.action) {
    case "click": {
      const el = await findElement(page, action.selector);
      if (!el || (await el.evaluate((e) => e === null))) {
        console.log(`   ⚠️  Element not found: ${action.selector}`);
        return false;
      }
      await el.click();
      console.log(`   ✓ click: ${action.selector}`);
      break;
    }

    case "fill": {
      const el = await findElement(page, action.selector);
      if (!el || (await el.evaluate((e) => e === null))) {
        console.log(`   ⚠️  Element not found: ${action.selector}`);
        return false;
      }
      await el.click({ clickCount: 3 }); // Select all
      await el.type(action.value);
      console.log(`   ✓ fill: ${action.selector} = "${action.value}"`);
      break;
    }

    case "scroll": {
      await page.evaluate((y) => window.scrollTo(0, y), action.scrollY || 0);
      console.log(`   ✓ scroll: ${action.scrollY}px`);
      break;
    }

    case "navigate": {
      await page.goto(action.url, { waitUntil: "networkidle2", timeout: 15000 });
      console.log(`   ✓ navigate: ${action.url}`);
      break;
    }

    case "wait": {
      const texts = Array.isArray(action.text) ? action.text : [action.text];
      const timeout = action.timeout || 15000;
      try {
        await page.waitForFunction(
          (txts) => txts.some((t) => document.body.innerText.includes(t)),
          { timeout },
          texts
        );
        console.log(`   ✓ wait: found "${texts[0]}"`);
      } catch {
        console.log(`   ⚠️  wait timeout: "${texts[0]}" not found after ${timeout}ms`);
        return false;
      }
      break;
    }

    case "eval": {
      const result = await page.evaluate(action.code);
      console.log(`   ✓ eval: ${action.code.substring(0, 50)}... → ${JSON.stringify(result)}`);
      break;
    }

    case "delay": {
      const ms = Math.round((action.ms || 1000) / speedMultiplier);
      await new Promise((r) => setTimeout(r, ms));
      console.log(`   ✓ delay: ${ms}ms`);
      break;
    }

    case "screenshot": {
      const path = action.path || `/tmp/replay-screenshot-${Date.now()}.png`;
      await page.screenshot({ path });
      console.log(`   ✓ screenshot: ${path}`);
      break;
    }

    case "reload": {
      await page.reload({ waitUntil: "networkidle2" });
      console.log(`   ✓ reload`);
      break;
    }

    case "set_store": {
      // Helper: switch POS store via localStorage
      await page.evaluate((storeId) => {
        const auth = JSON.parse(localStorage.getItem("auth-storage") || "{}");
        if (!auth.state) auth.state = {};
        auth.state.storeId = storeId;
        auth.state.token = null;
        auth.state.user = null;
        localStorage.setItem("auth-storage", JSON.stringify(auth));
      }, action.storeId);
      // Clear IndexedDB
      await page.evaluate(async () => {
        const dbs = await indexedDB.databases();
        for (const db of dbs) indexedDB.deleteDatabase(db.name);
      });
      console.log(`   ✓ set_store: ${action.storeId}`);
      break;
    }

    default:
      console.log(`   ⚠️  Unknown action: ${action.action}`);
      return false;
  }

  // Post-action delay (for visual pacing)
  if (action.postDelay) {
    const pd = Math.round(action.postDelay / speedMultiplier);
    await new Promise((r) => setTimeout(r, pd));
  }

  return true;
}

// ═══════════════════════════════════════════════════════════════════════
// Main replay loop
// ═══════════════════════════════════════════════════════════════════════
async function main() {
  const wsUrl = await findChrome();

  let browser;
  if (launchedBrowser) {
    browser = launchedBrowser;
    console.log(`   Using launched Chrome`);
  } else {
    console.log(`   Connecting to Chrome...`);
    browser = await puppeteer.connect({ browserWSEndpoint: wsUrl });
  }

  const pages = await browser.pages();
  let page = pages.find((p) => p.url().includes("lvh.me") || p.url().includes("localhost:3001")) || pages[0];

  if (!page) {
    page = await browser.newPage();
  }

  await page.setViewport({ width: vpWidth, height: vpHeight });
  console.log(`   Viewport: ${vpWidth}x${vpHeight}`);

  // Create output directory for segment recordings
  const outputDir = dirname(outputPath);
  mkdirSync(outputDir, { recursive: true });
  const segmentsDir = join(outputDir, "segments");
  mkdirSync(segmentsDir, { recursive: true });

  // Execute setup actions (not recorded)
  if (script.setup) {
    console.log(`\n⚙️  Setup (${script.setup.length} actions)`);
    for (const action of script.setup) {
      await executeAction(page, action, "setup");
    }
  }

  // Execute segments with per-segment screencast recording
  const actionLog = [];
  const segmentFiles = [];

  for (let si = 0; si < script.segments.length; si++) {
    const segment = script.segments[si];
    const segName = segment.name.toLowerCase().replace(/\s+/g, "-");
    const segFile = join(segmentsDir, `${segName}.mp4`);
    console.log(`\n📍 Segment ${si + 1}: ${segment.name}`);

    // Segment setup (not timed, not recorded)
    if (segment.setup) {
      console.log(`   Setup (${segment.setup.length} actions)`);
      for (const action of segment.setup) {
        await executeAction(page, action, segment.name);
      }
      // Small delay after setup for page to settle
      await new Promise((r) => setTimeout(r, 500));
    }

    // Start screencast recording for this segment
    let recorder = null;
    if (!noRecord) {
      try {
        recorder = await page.screencast({ path: segFile });
        console.log(`   🔴 Recording → ${segName}.mp4`);
      } catch (err) {
        console.log(`   ⚠️  Screencast unavailable: ${err.message}`);
      }
    }

    // Segment actions (timed)
    const segStart = Date.now();
    for (let ai = 0; ai < segment.actions.length; ai++) {
      const action = segment.actions[ai];
      const actionStart = Date.now();
      const success = await executeAction(page, action, segment.name);

      actionLog.push({
        segment: segment.name,
        segmentIndex: si,
        actionIndex: ai,
        action: action.action,
        selector: action.selector,
        thinking: action.thinking,
        success,
        timestampMs: actionStart - segStart,
        durationMs: Date.now() - actionStart,
      });
    }

    // Stop recording
    if (recorder) {
      await recorder.stop();
      if (existsSync(segFile) && readFileSync(segFile).length > 1000) {
        const segDur = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 ${segFile}`, { encoding: "utf8" }).trim() || "0");
        console.log(`   ⏹  Recorded: ${segDur.toFixed(1)}s → ${segName}.mp4`);
        segmentFiles.push(segFile);
      } else {
        console.log(`   ⚠️  Segment too small/empty, skipping`);
      }
    } else {
      const segDuration = (Date.now() - segStart) / 1000;
      console.log(`   ⏱  Segment duration: ${segDuration.toFixed(1)}s`);
    }
  }

  // Concat all segment recordings into one video
  if (segmentFiles.length > 0) {
    console.log(`\n🎬 Concatenating ${segmentFiles.length} segments...`);

    // Re-encode to common format first (segments may have different params)
    const reEncodedFiles = [];
    for (let i = 0; i < segmentFiles.length; i++) {
      const reFile = join(segmentsDir, `_re${i}.mp4`);
      execSync(`ffmpeg -y -i ${segmentFiles[i]} -c:v libx264 -preset fast -crf 23 -r 30 -pix_fmt yuv420p -an ${reFile} 2>/dev/null`);
      reEncodedFiles.push(reFile);
    }

    const concatList = join(segmentsDir, "_concat.txt");
    writeFileSync(concatList, reEncodedFiles.map((f) => `file '${f}'`).join("\n"));
    execSync(`ffmpeg -y -f concat -safe 0 -i ${concatList} -c copy ${outputPath} 2>/dev/null`);

    // Cleanup temp files
    for (const f of reEncodedFiles) { try { execSync(`rm ${f}`); } catch {} }
    try { execSync(`rm ${concatList}`); } catch {}

    const totalDur = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 ${outputPath}`, { encoding: "utf8" }).trim());
    console.log(`   Output: ${outputPath} (${totalDur.toFixed(1)}s)`);
  }

  // Save action log
  const logPath = outputPath.replace(/\.[^.]+$/, "-actions.json");
  writeFileSync(
    logPath,
    JSON.stringify({ meta: script.meta, log: actionLog }, null, 2)
  );
  console.log(`\n📝 Action log saved: ${logPath}`);

  console.log(`\n✅ Replay complete`);
  if (launchedBrowser) {
    await browser.close();
  } else {
    await browser.disconnect();
  }
}

main().catch((err) => {
  console.error(`\n❌ Replay failed: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
