#!/usr/bin/env node

/**
 * AutoDemo — Full automated demo pipeline
 *
 * Single command that: launches Chrome → replays actions → records screencast →
 * generates TTS → whisperx alignment → per-segment speed match → Remotion render
 *
 * Usage:
 *   node scripts/autodemo.mjs --script <replay.json> --narration <narration.json> [flags]
 *
 * Flags:
 *   --script <path>         Replay script (JSON)
 *   --narration <path>      Narration file (JSON) — text + segment mapping
 *   --output <path>         Final output video (default: final-output/demo.mp4)
 *   --output-dir <path>     Working directory (default: screencast-output/autodemo/)
 *   --voice <name>          TTS voice (default: en-US-GuyNeural)
 *   --speed <multiplier>    Replay speed multiplier for setup actions (default: 1.0)
 *   --skip-record           Skip recording (use existing segments)
 *   --skip-tts              Skip TTS generation (use existing audio)
 *   --skip-render           Skip Remotion render (just build video)
 *   --no-remotion           Output raw video without Remotion polish
 */

import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "fs";
import { resolve, join, dirname, basename } from "path";
import { execSync, spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ═══════════════════════════════════════════════════════════════════════
// Parse CLI args
// ═══════════════════════════════════════════════════════════════════════
const args = process.argv.slice(2);
function flag(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}

const scriptPath = flag("script");
const narrationPath = flag("narration");
const outputPath = resolve(flag("output") || "final-output/demo.mp4");
const outputDir = resolve(flag("output-dir") || "screencast-output/autodemo");
const voice = flag("voice") || "en-US-GuyNeural";
const replaySpeed = parseFloat(flag("speed") || "1.0");
const skipRecord = args.includes("--skip-record");
const skipTts = args.includes("--skip-tts");
const skipRender = args.includes("--skip-render");
const noRemotion = args.includes("--no-remotion");

if (!narrationPath) {
  console.error("Usage: node scripts/autodemo.mjs --narration <narration.json> [--script <replay.json>] [flags]");
  console.error("  --script is optional with --skip-record (uses existing recordings)");
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });

// Script is optional when --skip-record — generate a stub from narration segments
const script = scriptPath && scriptPath !== "/dev/null" && existsSync(resolve(scriptPath))
  ? JSON.parse(readFileSync(resolve(scriptPath), "utf8"))
  : { segments: [] };
const narration = JSON.parse(readFileSync(resolve(narrationPath), "utf8"));

// If no script segments, create stubs from narration so segment count matches
if (script.segments.length === 0 && narration.segments?.length) {
  for (const seg of narration.segments) {
    script.segments.push({ name: seg.sceneLabel || `Segment ${seg.sceneIndex}`, actions: [] });
  }
}

console.log("\n╔══════════════════════════════════════════╗");
console.log("║           AutoDemo Pipeline              ║");
console.log("╚══════════════════════════════════════════╝\n");
console.log(`  Script:    ${scriptPath || "(auto from narration)"} (${script.segments?.length} segments)`);
console.log(`  Narration: ${narrationPath} (${narration.segments?.length} segments)`);
console.log(`  Output:    ${outputPath}`);
console.log(`  Voice:     ${voice}\n`);

// ═══════════════════════════════════════════════════════════════════════
// STEP 1: Generate TTS + word timings
// ═══════════════════════════════════════════════════════════════════════
const ttsPath = join(outputDir, "narration.mp3");
const vttPath = join(outputDir, "narration.vtt");
const wavPath = join(outputDir, "narration.16k.wav");
const wordTimingsPath = join(outputDir, "word-timings.json");

if (!skipTts || !existsSync(ttsPath)) {
  console.log("══ STEP 1: Generate TTS ══\n");

  const fullText = narration.fullText;
  execSync(`edge-tts --text ${JSON.stringify(fullText)} --voice ${voice} --write-media ${ttsPath} --write-subtitles ${vttPath}`, { stdio: "inherit" });

  // Convert to 16k wav for whisperx
  execSync(`ffmpeg -y -i ${ttsPath} -ar 16000 -ac 1 ${wavPath} 2>/dev/null`);

  const ttsDur = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 ${ttsPath}`, { encoding: "utf8" }).trim());
  console.log(`\n  TTS: ${ttsDur.toFixed(1)}s\n`);

  // WhisperX forced alignment for perfect word timing
  console.log("══ STEP 1b: WhisperX forced alignment ══\n");

  try {
    const whisperScript = join(outputDir, "_whisperx_align.py");
    writeFileSync(whisperScript, `
import whisperx, json, torch, sys
device = 'cpu'
compute_type = 'int8'
audio_path = sys.argv[1]
output_path = sys.argv[2]
model = whisperx.load_model('base', device, compute_type=compute_type)
audio = whisperx.load_audio(audio_path)
result = model.transcribe(audio, batch_size=16)
align_model, metadata = whisperx.load_align_model(language_code='en', device=device)
aligned = whisperx.align(result['segments'], align_model, metadata, audio, device, return_char_alignments=False)
words = []
for seg in aligned['segments']:
    for w in seg.get('words', []):
        if 'start' in w and 'end' in w:
            words.append({'text': w['word'].strip(), 'startMs': int(w['start']*1000), 'endMs': int(w['end']*1000)})
with open(output_path, 'w') as f:
    json.dump(words, f, indent=2)
if words:
    print(f"{len(words)} words aligned, last at {words[-1]['endMs']/1000:.1f}s")
else:
    print("0 words aligned")
`);
    execSync(`python3 "${whisperScript}" "${ttsPath}" "${wordTimingsPath}"`, { stdio: "inherit", timeout: 180000 });
  } catch (err) {
    console.log("  WhisperX failed, falling back to VTT phrase timing");
    // Fallback: parse VTT for approximate timing
    const vttContent = readFileSync(vttPath, "utf8");
    const words = [];
    const re = /(\d+):(\d+):(\d+),(\d+)\s*-->\s*(\d+):(\d+):(\d+),(\d+)\s*\n(.+)/g;
    let match;
    while ((match = re.exec(vttContent)) !== null) {
      const [, h1, m1, s1, ms1, h2, m2, s2, ms2, text] = match;
      const start = +h1 * 3600000 + +m1 * 60000 + +s1 * 1000 + +ms1;
      const end = +h2 * 3600000 + +m2 * 60000 + +s2 * 1000 + +ms2;
      const cueWords = text.trim().split(/\s+/);
      const wordDur = (end - start) / cueWords.length;
      cueWords.forEach((w, i) => {
        const clean = w.replace(/[^a-zA-Z0-9'-]/g, "").toLowerCase();
        if (clean) words.push({ text: clean, startMs: Math.round(start + i * wordDur), endMs: Math.round(start + (i + 1) * wordDur) });
      });
    }
    writeFileSync(wordTimingsPath, JSON.stringify(words, null, 2));
    console.log(`  VTT fallback: ${words.length} words`);
  }
} else {
  console.log("══ STEP 1: TTS (skipped — using existing) ══\n");
}

// ═══════════════════════════════════════════════════════════════════════
// STEP 2: Compute per-segment audio boundaries from VTT
// ═══════════════════════════════════════════════════════════════════════
console.log("══ STEP 2: Compute segment timing ══\n");

const ttsDur = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 ${ttsPath}`, { encoding: "utf8" }).trim());

// Parse VTT cues
const vttContent = readFileSync(vttPath, "utf8");
const cues = [];
const cueRe = /(\d+):(\d+):(\d+),(\d+)\s*-->\s*(\d+):(\d+):(\d+),(\d+)\s*\n(.+)/g;
let cueMatch;
while ((cueMatch = cueRe.exec(vttContent)) !== null) {
  const [, h1, m1, s1, ms1, h2, m2, s2, ms2, text] = cueMatch;
  const start = +h1 * 3600000 + +m1 * 60000 + +s1 * 1000 + +ms1;
  const end = +h2 * 3600000 + +m2 * 60000 + +s2 * 1000 + +ms2;
  cues.push({ start: start / 1000, end: end / 1000, text: text.trim() });
}

// Find audio start time for each narration segment
const segmentAudio = narration.segments.map((seg, i) => {
  const firstWords = seg.text.substring(0, 30).toLowerCase();
  let startSec = 0;
  for (const c of cues) {
    if (c.text.toLowerCase().startsWith(firstWords.substring(0, 20))) {
      startSec = c.start;
      break;
    }
  }

  let endSec = ttsDur;
  if (i + 1 < narration.segments.length) {
    const nextFirst = narration.segments[i + 1].text.substring(0, 30).toLowerCase();
    for (const c of cues) {
      if (c.text.toLowerCase().startsWith(nextFirst.substring(0, 20))) {
        endSec = c.start;
        break;
      }
    }
  }

  const audioDur = endSec - startSec;
  console.log(`  ${seg.sceneLabel}: ${startSec.toFixed(1)}-${endSec.toFixed(1)}s (${audioDur.toFixed(1)}s audio)`);
  return { startSec, endSec, audioDur };
});

// ═══════════════════════════════════════════════════════════════════════
// STEP 3: Record segments (or use existing)
// ═══════════════════════════════════════════════════════════════════════
const segmentFiles = [];

if (!skipRecord) {
  console.log("\n══ STEP 3: Record segments ══\n");

  // Find Chrome
  let browser;
  let launched = false;

  const endpoints = ["http://127.0.0.1:9222", "http://127.0.0.1:9223"];
  let wsUrl = null;
  for (const ep of endpoints) {
    try {
      const resp = await fetch(`${ep}/json/version`);
      const data = await resp.json();
      wsUrl = data.webSocketDebuggerUrl;
      console.log(`  Found Chrome: ${data.Browser}`);
      break;
    } catch {}
  }

  if (wsUrl) {
    browser = await puppeteer.connect({ browserWSEndpoint: wsUrl });
  } else {
    const chromePath = execSync("which google-chrome || which chromium-browser || which chromium", { encoding: "utf8" }).trim();
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: false,
      args: ["--window-size=1920,1080", "--no-first-run", "--no-default-browser-check"],
      defaultViewport: { width: 1920, height: 1080 },
    });
    launched = true;
    console.log(`  Launched Chrome: ${chromePath}`);
  }

  const pages = await browser.pages();
  let page = pages.find((p) => p.url().includes("localhost")) || pages[0];
  if (!page) page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  // Helper: find element by text
  async function clickText(page, text) {
    const el = await page.evaluateHandle((t) => {
      const candidates = document.querySelectorAll('button, a, h1, h2, h3, h4, span, label, div, [role="button"], [role="tab"]');
      for (const el of candidates) {
        if (el.textContent.trim() === t || el.textContent.trim().startsWith(t)) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) return el;
        }
      }
      return null;
    }, text);
    if (el) await el.click();
    return el;
  }

  // Execute each segment
  for (let si = 0; si < script.segments.length; si++) {
    const segment = script.segments[si];
    const segFile = join(outputDir, `seg${si}.mp4`);
    segmentFiles.push(segFile);

    console.log(`\n  📍 Segment ${si}: ${segment.name}`);

    // Run setup actions (not recorded) — fast
    if (segment.setup) {
      for (const action of segment.setup) {
        try {
          if (action.action === "set_store") {
            await page.evaluate((id) => {
              const auth = JSON.parse(localStorage.getItem("auth-storage") || "{}");
              if (!auth.state) auth.state = {};
              auth.state.storeId = id;
              auth.state.token = null;
              auth.state.user = null;
              localStorage.setItem("auth-storage", JSON.stringify(auth));
            }, action.storeId);
            await page.evaluate(async () => { const dbs = await indexedDB.databases(); for (const db of dbs) indexedDB.deleteDatabase(db.name); });
          } else if (action.action === "navigate") {
            await page.goto(action.url, { waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
          } else if (action.action === "reload") {
            await page.reload({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
          } else if (action.action === "wait") {
            const texts = Array.isArray(action.text) ? action.text : [action.text];
            await page.waitForFunction((txts) => txts.some((t) => document.body.innerText.includes(t)), { timeout: 15000 }, texts).catch(() => {});
          } else if (action.action === "click") {
            if (action.selector?.startsWith("text=")) {
              await clickText(page, action.selector.slice(5));
            } else if (action.selector?.startsWith("css=")) {
              const el = await page.$(action.selector.slice(4));
              if (el) await el.click();
            }
          } else if (action.action === "fill") {
            const el = await page.$(action.selector?.replace("css=", "") || "input");
            if (el) { await el.click({ clickCount: 3 }); await el.type(action.value); }
          }
        } catch (err) {
          console.log(`     setup action failed: ${action.action} — ${err.message}`);
        }
        await new Promise((r) => setTimeout(r, 200)); // Small delay between setup actions
      }
    }

    // Calculate target duration for this segment (narration audio duration)
    const audioDur = segmentAudio[si]?.audioDur || 20;
    const actionCount = segment.actions?.length || 1;

    // Start recording via CDP screencast
    // (Using page.screencast if available, otherwise manual frame capture)
    console.log(`     Recording (target: ${audioDur.toFixed(1)}s for ${actionCount} actions)...`);

    // Simple approach: use ffmpeg to screen-record via x11grab or use page screenshot loop
    // For now, use the Puppeteer screencast API
    let recorder;
    try {
      recorder = await page.screencast({ path: segFile });
    } catch {
      // Fallback: just execute actions and we'll record externally
      console.log("     (screencast API unavailable — executing actions only)");
    }

    // Execute recorded actions with narration-paced delays
    const baseDelay = (audioDur * 1000) / Math.max(actionCount, 1);

    for (const action of segment.actions || []) {
      // Use action's delay if specified, otherwise distribute evenly
      const delay = action.delay || Math.round(baseDelay);
      await new Promise((r) => setTimeout(r, Math.round(delay / replaySpeed)));

      try {
        if (action.action === "click") {
          if (action.selector?.startsWith("text=")) {
            await clickText(page, action.selector.slice(5));
          }
          console.log(`     ✓ click: ${action.selector}`);
        } else if (action.action === "scroll") {
          await page.evaluate((y) => window.scrollTo({ top: y, behavior: "smooth" }), action.scrollY || 0);
          console.log(`     ✓ scroll: ${action.scrollY}px`);
        } else if (action.action === "wait") {
          const texts = Array.isArray(action.text) ? action.text : [action.text];
          await page.waitForFunction((txts) => txts.some((t) => document.body.innerText.includes(t)), { timeout: action.timeout || 15000 }, texts).catch(() => {});
          console.log(`     ✓ wait: ${texts[0]}`);
        } else if (action.action === "delay") {
          await new Promise((r) => setTimeout(r, Math.round((action.ms || 1000) / replaySpeed)));
          console.log(`     ✓ delay: ${action.ms}ms`);
        } else if (action.action === "fill") {
          if (action.selector?.startsWith("css=")) {
            const el = await page.$(action.selector.slice(4));
            if (el) { await el.click({ clickCount: 3 }); await el.type(action.value); }
          }
          console.log(`     ✓ fill: ${action.selector}`);
        } else if (action.action === "navigate") {
          await page.goto(action.url, { waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
          console.log(`     ✓ navigate: ${action.url}`);
        } else if (action.action === "eval") {
          await page.evaluate(action.code);
          console.log(`     ✓ eval`);
        }
      } catch (err) {
        console.log(`     ⚠️ ${action.action} failed: ${err.message}`);
      }

      if (action.postDelay) {
        await new Promise((r) => setTimeout(r, Math.round(action.postDelay / replaySpeed)));
      }
    }

    // Stop recording
    if (recorder) {
      await recorder.stop();
    }

    const segDur = existsSync(segFile)
      ? parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 ${segFile}`, { encoding: "utf8" }).trim() || "0")
      : 0;
    console.log(`     Recorded: ${segDur.toFixed(1)}s → ${segFile}`);
  }

  if (launched) await browser.close();
  else await browser.disconnect();

} else {
  console.log("\n══ STEP 3: Recording (skipped — using existing) ══\n");
  // Look for existing segment files (seg0.mp4, seg1.mp4, ...)
  for (let si = 0; si < script.segments.length; si++) {
    const segFile = join(outputDir, `seg${si}.mp4`);
    if (existsSync(segFile)) {
      segmentFiles.push(segFile);
      const dur = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${segFile}"`, { encoding: "utf8" }).trim() || "0");
      console.log(`  seg${si}: ${dur.toFixed(1)}s`);
    }
  }
  // Fallback: if no numbered segments, look for a single recording.mp4
  if (segmentFiles.length === 0) {
    const singleRecording = join(outputDir, "recording.mp4");
    if (existsSync(singleRecording)) {
      console.log("  Found single recording.mp4 — using as one segment");
      segmentFiles.push(singleRecording);
      const dur = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${singleRecording}"`, { encoding: "utf8" }).trim() || "0");
      console.log(`  recording.mp4: ${dur.toFixed(1)}s`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// STEP 4: Per-segment speed matching
// ═══════════════════════════════════════════════════════════════════════
console.log("\n══ STEP 4: Speed match segments to narration ══\n");

// If single recording with multiple narration segments, slice the recording
// using videoStartSec/videoEndSec from narration, or distribute evenly
if (segmentFiles.length === 1 && narration.segments.length > 1) {
  const singleFile = segmentFiles[0];
  const totalDur = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${singleFile}"`, { encoding: "utf8" }).trim());

  // Check if narration segments have explicit video timestamps
  const hasVideoTimes = narration.segments.some(s => s.videoStartSec != null || s.videoEndSec != null);

  console.log(`  Slicing single recording (${totalDur.toFixed(1)}s) into ${narration.segments.length} segments${hasVideoTimes ? " using videoStartSec/videoEndSec" : " (evenly distributed)"}...\n`);

  segmentFiles.length = 0;
  for (let i = 0; i < narration.segments.length; i++) {
    const seg = narration.segments[i];
    let startSec, endSec;

    if (hasVideoTimes) {
      startSec = seg.videoStartSec ?? 0;
      endSec = seg.videoEndSec ?? (i + 1 < narration.segments.length ? (narration.segments[i + 1].videoStartSec ?? totalDur) : totalDur);
    } else {
      // Distribute evenly across the recording
      const sliceDur = totalDur / narration.segments.length;
      startSec = i * sliceDur;
      endSec = (i + 1) * sliceDur;
    }

    const sliceDur = endSec - startSec;
    const sliceFile = join(outputDir, `seg${i}.mp4`);
    execSync(`ffmpeg -y -ss ${startSec.toFixed(3)} -to ${endSec.toFixed(3)} -i "${singleFile}" -c:v libx264 -preset fast -crf 23 -an "${sliceFile}" 2>/dev/null`);
    segmentFiles.push(sliceFile);
    console.log(`  seg${i} (${seg.sceneLabel || ""}): ${startSec.toFixed(1)}-${endSec.toFixed(1)}s (${sliceDur.toFixed(1)}s footage)`);
  }
  console.log();
}

const speedFiles = [];
for (let i = 0; i < segmentFiles.length; i++) {
  const segFile = segmentFiles[i];
  if (!existsSync(segFile)) continue;

  const segDur = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${segFile}"`, { encoding: "utf8" }).trim());
  const audioDur = segmentAudio[i]?.audioDur || segDur;
  const speed = segDur / audioDur;
  const speedFile = join(outputDir, `seg${i}_speed.mp4`);

  if (Math.abs(speed - 1.0) < 0.05) {
    // Close to 1x — just copy
    copyFileSync(segFile, speedFile);
    console.log(`  seg${i}: ${segDur.toFixed(1)}s → ${audioDur.toFixed(1)}s (1.0x, copy)`);
  } else {
    execSync(`ffmpeg -y -i "${segFile}" -filter:v "setpts=PTS/${speed.toFixed(4)}" -an -c:v libx264 -preset fast -crf 23 "${speedFile}" 2>/dev/null`);
    console.log(`  seg${i}: ${segDur.toFixed(1)}s → ${audioDur.toFixed(1)}s (${speed.toFixed(2)}x)`);
  }
  speedFiles.push(speedFile);
}

// ═══════════════════════════════════════════════════════════════════════
// STEP 5: Concat + merge audio
// ═══════════════════════════════════════════════════════════════════════
console.log("\n══ STEP 5: Build final video ══\n");

const concatList = join(outputDir, "concat.txt");
writeFileSync(concatList, speedFiles.map((f) => `file '${f}'`).join("\n"));

const concatVideo = join(outputDir, "speed-matched.mp4");
execSync(`ffmpeg -y -f concat -safe 0 -i ${concatList} -c copy ${concatVideo} 2>/dev/null`);

const syncedVideo = join(outputDir, "final-synced.mp4");
execSync(`ffmpeg -y -i ${concatVideo} -i ${ttsPath} -map 0:v -map 1:a -shortest -c:v copy -c:a aac ${syncedVideo} 2>/dev/null`);

const finalDur = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 ${syncedVideo}`, { encoding: "utf8" }).trim());
console.log(`  Synced video: ${finalDur.toFixed(1)}s`);

// ═══════════════════════════════════════════════════════════════════════
// STEP 6: Remotion render (optional)
// ═══════════════════════════════════════════════════════════════════════
if (!noRemotion && !skipRender) {
  console.log("\n══ STEP 6: Remotion render ══\n");

  const publicDir = join(ROOT, "demo-render", "public");

  // Pad video to match narration audio duration so audio doesn't cut off
  const narDurRaw = execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${ttsPath}"`, { encoding: "utf8" }).trim();
  const narDurSec = parseFloat(narDurRaw) || 0;
  const vidDurSec = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${syncedVideo}"`, { encoding: "utf8" }).trim()) || 0;
  if (narDurSec > vidDurSec + 1) {
    const padDur = (narDurSec - vidDurSec + 3).toFixed(2);
    const paddedVideo = join(outputDir, "final-synced-padded.mp4");
    console.log(`  Padding video: ${vidDurSec.toFixed(1)}s → ${narDurSec.toFixed(1)}s (+${padDur}s freeze frame)`);
    execSync(`ffmpeg -y -i "${syncedVideo}" -i "${ttsPath}" -filter_complex "[0:v]tpad=stop_mode=clone:stop_duration=${padDur}[vpad]" -map "[vpad]" -map 1:a -c:v libx264 -preset fast -crf 23 -c:a aac -shortest "${paddedVideo}"`, { stdio: "pipe" });
    copyFileSync(paddedVideo, join(publicDir, "screen.mp4"));
  } else {
    copyFileSync(syncedVideo, join(publicDir, "screen.mp4"));
  }

  // Build props
  const wordTimings = JSON.parse(readFileSync(wordTimingsPath, "utf8"));
  const FPS = 30;
  // Video duration must be at least as long as narration audio + padding
  // so the outro crossfade doesn't clip the final narration
  const narrationDur = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${ttsPath}"`, { encoding: "utf8" }).trim()) || 0;
  const videoDurationFrames = Math.round(Math.max(finalDur, narrationDur + 3) * FPS);
  const introDurationFrames = 90;
  const outroDurationFrames = 90;

  // Auto-generate lower thirds from narration segment labels
  const lowerThirds = narration.segments
    .filter(seg => seg.sceneLabel)
    .map((seg, i) => {
      const segTiming = segmentAudio[i];
      if (!segTiming) return null;
      const startFrame = Math.round(segTiming.startSec * FPS);
      const durationFrames = Math.min(Math.round(segTiming.audioDur * FPS), 150); // max 5 seconds
      return {
        label: seg.sceneLabel,
        startFrame: startFrame + 15, // slight delay after segment starts
        durationFrames,
      };
    })
    .filter(Boolean);

  console.log(`  Lower thirds: ${lowerThirds.length} segment labels`);

  const props = {
    wordTimings,
    lowerThirds,
    zoomRegions: [],
    callouts: [],
    showAvatar: false,
    showPresenter: false,
    mouthCues: [],
    audioVolume: 1.3,
    introDurationFrames,
    transitionDurationFrames: 0,
    videoDurationFrames,
    outroDurationFrames,
    introTagline: narration.introTagline || "",
    introSubtitle: narration.introSubtitle || "",
    outroHeading: narration.outroHeading || "",
    outroUrl: narration.outroUrl || "",
    outroCtaText: narration.outroCtaText || "",
    accentColor: narration.accentColor || "rgba(16, 185, 129, 1)",
    introVideoSrc: narration.introVideoSrc || undefined,
    outroVideoSrc: narration.outroVideoSrc || undefined,
    introLogoSrc: "",
  };

  // If narration specifies a logo, copy it to public dir and set the prop
  if (narration.introLogoSrc) {
    const logoSource = resolve(narration.introLogoSrc);
    if (existsSync(logoSource)) {
      const logoExt = logoSource.split(".").pop();
      const logoDest = join(publicDir, `intro-logo.${logoExt}`);
      copyFileSync(logoSource, logoDest);
      props.introLogoSrc = `intro-logo.${logoExt}`;
      console.log(`  Intro logo: ${logoSource}`);
    }
  }
  // Also check outputDir for a logo.png/logo.svg captured during recording
  if (!props.introLogoSrc) {
    for (const ext of ["png", "svg", "webp", "jpg"]) {
      const logoFile = join(outputDir, `logo.${ext}`);
      if (existsSync(logoFile)) {
        copyFileSync(logoFile, join(publicDir, `intro-logo.${ext}`));
        props.introLogoSrc = `intro-logo.${ext}`;
        console.log(`  Intro logo (auto-detected): logo.${ext}`);
        break;
      }
    }
  }

  const propsPath = join(publicDir, "screencast-props.json");
  writeFileSync(propsPath, JSON.stringify(props, null, 2));

  const totalFrames = introDurationFrames + videoDurationFrames + outroDurationFrames;
  console.log(`  Props: ${totalFrames} frames (${(totalFrames / FPS).toFixed(1)}s)`);
  console.log(`  Word timings: ${wordTimings.length}`);

  // Render
  execSync(
    `cd ${join(ROOT, "demo-render")} && npx remotion render src/index.ts MarketingDemo --props=public/screencast-props.json --output=${outputPath} --overwrite`,
    { stdio: "inherit", timeout: 600000 }
  );

  console.log(`\n  ✅ Rendered: ${outputPath}`);
} else if (noRemotion) {
  // Just copy the synced video as output
  copyFileSync(syncedVideo, outputPath);
  console.log(`\n  ✅ Output (no Remotion): ${outputPath}`);
} else {
  console.log("\n  Render skipped");
}

// ═══════════════════════════════════════════════════════════════════════
// STEP 7: Sync Audit — detect narration/action misalignment
// ═══════════════════════════════════════════════════════════════════════
console.log("\n══ STEP 7: Sync Audit ══\n");

// Collect all timeline JSONLs from segment recordings
const allActions = [];
let cumulativeOffsetMs = 0;

for (let i = 0; i < segmentFiles.length; i++) {
  const jsonlPath = segmentFiles[i].replace(/\.mp4$/, ".jsonl");
  if (!existsSync(jsonlPath)) continue;

  const lines = readFileSync(jsonlPath, "utf8").split("\n").filter(l => l.trim());
  const starts = new Map();

  for (const line of lines) {
    const entry = JSON.parse(line);
    if (entry.type === "start") starts.set(entry.id, entry);
    else if (entry.type === "end") {
      const start = starts.get(entry.id);
      if (start && start.classification === "action" && entry.elementText) {
        allActions.push({
          segment: script.segments[i]?.name || `seg${i}`,
          segmentIndex: i,
          tool: start.tool,
          elementText: entry.elementText.toLowerCase(),
          recordingOffsetMs: start.offsetMs,
          // Offset within the full video (cumulative across segments)
          globalOffsetMs: cumulativeOffsetMs + start.offsetMs,
        });
      }
    }
  }

  // Add this segment's duration to cumulative offset
  const segDur = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 ${segmentFiles[i]}`, { encoding: "utf8" }).trim()) * 1000;
  cumulativeOffsetMs += segDur;
}

// Cross-reference with word timings
const wordTimingsData = existsSync(wordTimingsPath) ? JSON.parse(readFileSync(wordTimingsPath, "utf8")) : [];

const auditResults = [];
let hasIssues = false;

for (const action of allActions) {
  const keyword = action.elementText.split(/\s+/)[0];
  if (keyword.length < 3) continue;

  // Find this keyword in word timings
  const wordMatch = wordTimingsData.find(w =>
    w.text.toLowerCase() === keyword || w.text.toLowerCase().startsWith(keyword)
  );

  if (wordMatch) {
    // After per-segment speed matching, estimate when this action appears in the final video
    const segAudio = segmentAudio[action.segmentIndex];
    const segVideoDur = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 ${segmentFiles[action.segmentIndex]}`, { encoding: "utf8" }).trim()) * 1000;
    const speed = segVideoDur / (segAudio?.audioDur * 1000 || segVideoDur);
    const actionInFinalMs = (segAudio?.startSec * 1000 || 0) + (action.recordingOffsetMs / speed);

    const deltaMs = wordMatch.startMs - actionInFinalMs;
    const severity = Math.abs(deltaMs) < 2000 ? "ok" : Math.abs(deltaMs) < 5000 ? "minor" : "major";

    const result = {
      keyword,
      elementText: action.elementText,
      segment: action.segment,
      actionInRecordingMs: action.recordingOffsetMs,
      actionInFinalMs: Math.round(actionInFinalMs),
      wordInNarrationMs: wordMatch.startMs,
      deltaMs: Math.round(deltaMs),
      severity,
      issue: deltaMs > 0 ? "narration mentions it AFTER it appears" : "narration mentions it BEFORE it appears",
    };

    auditResults.push(result);
    if (severity !== "ok") hasIssues = true;

    const icon = severity === "ok" ? "✓" : severity === "minor" ? "~" : "✗";
    console.log(`  ${icon} "${action.elementText.substring(0, 25).padEnd(25)}" action@${(actionInFinalMs/1000).toFixed(1)}s narration@${(wordMatch.startMs/1000).toFixed(1)}s Δ${(deltaMs/1000).toFixed(1)}s`);
  }
}

if (auditResults.length === 0) {
  console.log("  No action-to-narration matches found (need enhanced timeline with element text)");
  console.log("  Re-record with the latest MCP fork to capture element context");
}

// Write audit report
const auditPath = join(outputDir, "sync-audit.json");
writeFileSync(auditPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  actions: allActions.length,
  matches: auditResults.length,
  issues: auditResults.filter(r => r.severity !== "ok"),
  all: auditResults,
}, null, 2));

if (hasIssues) {
  const issues = auditResults.filter(r => r.severity !== "ok");
  console.log(`\n  ⚠️  ${issues.length} sync issue(s) detected.`);
  console.log(`  Review: ${auditPath}`);
  console.log(`\n  ┌─────────────────────────────────────────────────────────┐`);
  console.log(`  │ CLAUDE CODE: Review the sync audit above.               │`);
  console.log(`  │ To fix, adjust delays in the replay script so actions   │`);
  console.log(`  │ happen when the narration mentions them, then re-run:   │`);
  console.log(`  │                                                         │`);
  console.log(`  │   node scripts/autodemo.mjs --script <replay.json> \\    │`);
  console.log(`  │     --narration <narration.json>                        │`);
  console.log(`  └─────────────────────────────────────────────────────────┘`);
} else {
  console.log(`\n  ✅ All matched actions sync within 2s of narration.`);
}

// ═══════════════════════════════════════════════════════════════════════
// STEP 8: Bundle into self-contained demo folder
// ═══════════════════════════════════════════════════════════════════════
console.log("\n══ STEP 8: Bundle demo folder ══\n");

const timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
const bundleDir = join(outputDir, `bundle-${timestamp}`);
mkdirSync(bundleDir, { recursive: true });
mkdirSync(join(bundleDir, "segments"), { recursive: true });

// Copy replay script and narration
if (scriptPath && scriptPath !== "/dev/null" && existsSync(resolve(scriptPath))) {
  copyFileSync(resolve(scriptPath), join(bundleDir, "replay-script.json"));
}
copyFileSync(resolve(narrationPath), join(bundleDir, "narration.json"));
copyFileSync(ttsPath, join(bundleDir, "narration.mp3"));
if (existsSync(wordTimingsPath)) copyFileSync(wordTimingsPath, join(bundleDir, "word-timings.json"));
if (existsSync(vttPath)) copyFileSync(vttPath, join(bundleDir, "narration.vtt"));
if (existsSync(auditPath)) copyFileSync(auditPath, join(bundleDir, "sync-audit.json"));

// Copy segment recordings
for (let i = 0; i < segmentFiles.length; i++) {
  if (existsSync(segmentFiles[i])) {
    const segName = script.segments[i]?.name?.toLowerCase().replace(/\s+/g, "-") || `seg${i}`;
    copyFileSync(segmentFiles[i], join(bundleDir, "segments", `${segName}.mp4`));
  }
}

// Copy final output
if (existsSync(outputPath)) {
  copyFileSync(outputPath, join(bundleDir, "final.mp4"));
}

// Write manifest
const manifest = {
  name: script.meta?.name || "Demo",
  created: new Date().toISOString(),
  narrationDuration: ttsDur,
  segments: script.segments.map((s, i) => ({
    name: s.name,
    audioDuration: segmentAudio[i]?.audioDur,
    file: `segments/${s.name.toLowerCase().replace(/\s+/g, "-")}.mp4`,
  })),
  files: {
    replayScript: "replay-script.json",
    narration: "narration.json",
    audio: "narration.mp3",
    wordTimings: "word-timings.json",
    final: "final.mp4",
  },
  howToReRecord: `node scripts/autodemo.mjs --script ${join(bundleDir, "replay-script.json")} --narration ${join(bundleDir, "narration.json")} --output-dir ${outputDir}`,
};
writeFileSync(join(bundleDir, "manifest.json"), JSON.stringify(manifest, null, 2));

console.log(`  Bundle: ${bundleDir}`);
console.log(`  Files:`);
console.log(`    replay-script.json`);
console.log(`    narration.json + narration.mp3`);
console.log(`    word-timings.json`);
console.log(`    segments/ (${segmentFiles.length} recordings)`);
console.log(`    final.mp4`);
console.log(`    manifest.json`);

// ═══════════════════════════════════════════════════════════════════════
// STEP 9: H265 compressed output (email-friendly)
// ═══════════════════════════════════════════════════════════════════════
const compressedPath = outputPath.replace(/\.mp4$/, "-compressed.mp4");
if (existsSync(outputPath)) {
  console.log("\n══ STEP 9: Compress (h265) ══\n");
  try {
    execSync(`ffmpeg -y -i "${outputPath}" -c:v libx265 -preset medium -crf 28 -tag:v hvc1 -c:a aac -b:a 128k -vf "scale=1920:1080" "${compressedPath}" 2>/dev/null`);
    const compSize = (readFileSync(compressedPath).length / 1024 / 1024).toFixed(1);
    console.log(`  Compressed: ${compressedPath} (${compSize} MB)`);
  } catch (err) {
    console.log(`  ⚠️  Compression failed: ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// DONE
// ═══════════════════════════════════════════════════════════════════════
const outSize = existsSync(outputPath) ? (readFileSync(outputPath).length / 1024 / 1024).toFixed(1) : "?";
const outDur = existsSync(outputPath)
  ? parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${outputPath}"`, { encoding: "utf8" }).trim()).toFixed(1)
  : "?";

const compSize = existsSync(compressedPath) ? (readFileSync(compressedPath).length / 1024 / 1024).toFixed(1) : null;

console.log("\n╔══════════════════════════════════════════╗");
console.log("║           AutoDemo Complete               ║");
console.log("╠══════════════════════════════════════════╣");
console.log(`║  Output:     ${basename(outputPath).padEnd(27)}║`);
console.log(`║  Duration:   ${(outDur + "s").padEnd(27)}║`);
console.log(`║  Size:       ${(outSize + " MB").padEnd(27)}║`);
if (compSize) {
  console.log(`║  Compressed: ${(compSize + " MB").padEnd(27)}║`);
}
console.log(`║  Bundle:     bundle-${timestamp.padEnd(19)}║`);
console.log("╚══════════════════════════════════════════╝\n");
if (scriptPath && scriptPath !== "/dev/null") {
  console.log(`  Re-record: node scripts/autodemo.mjs --script ${bundleDir}/replay-script.json --narration ${bundleDir}/narration.json\n`);
}
