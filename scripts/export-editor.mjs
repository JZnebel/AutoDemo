#!/usr/bin/env node
/**
 * export-editor.mjs — Package an AutoDemo bundle for manual video editors.
 *
 * Takes a bundle folder (produced by autodemo) and creates an editor-ready
 * export with numbered clips, per-segment audio, SRT subtitles, and a
 * FCP7 XML timeline that opens in Premiere, Resolve, and Final Cut Pro.
 *
 * Usage:
 *   node scripts/export-editor.mjs <bundle-folder>
 *   node scripts/export-editor.mjs screencast-output/trafficstores-v3/bundle-2026-03-31T07-21-06/
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "fs";
import { join, resolve, dirname, basename, extname } from "path";
import { execSync } from "child_process";

// ── Parse args ────────────────────────────────────────────────────────────
const bundleDir = resolve(process.argv[2] || "");
if (!bundleDir || !existsSync(join(bundleDir, "manifest.json"))) {
  console.error("Usage: node scripts/export-editor.mjs <bundle-folder>");
  console.error("  The bundle folder must contain manifest.json");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(bundleDir, "manifest.json"), "utf8"));
const narration = JSON.parse(readFileSync(join(bundleDir, "narration.json"), "utf8"));
const demoName = narration.introSubtitle || narration.introTagline || manifest.name || "AutoDemo";

console.log(`\n╔══════════════════════════════════════════╗`);
console.log(`║         Editor Export                     ║`);
console.log(`╚══════════════════════════════════════════╝\n`);
console.log(`  Bundle: ${bundleDir}`);
console.log(`  Demo:   ${demoName}`);
console.log(`  Segments: ${manifest.segments.length}\n`);

// ── Create output structure ───────────────────────────────────────────────
const outDir = join(dirname(bundleDir), "editor-export");
for (const sub of ["clips", "audio", "subtitles", "assets", "raw"]) {
  mkdirSync(join(outDir, sub), { recursive: true });
}

// ── Step 1: Copy & rename segment clips ───────────────────────────────────
console.log("══ Step 1: Copy segment clips ══\n");
const segments = manifest.segments;
const clipFiles = [];

for (let i = 0; i < segments.length; i++) {
  const seg = segments[i];
  const srcPath = join(bundleDir, seg.file);
  const slug = seg.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
  const num = String(i + 1).padStart(2, "0");
  const destName = `${num}-${slug}.mp4`;
  const destPath = join(outDir, "clips", destName);

  if (existsSync(srcPath)) {
    copyFileSync(srcPath, destPath);
    clipFiles.push({ name: destName, segment: seg, index: i });
    console.log(`  ${destName} (${seg.audioDuration.toFixed(1)}s)`);
  } else {
    console.log(`  ⚠ Missing: ${srcPath}`);
  }
}

// ── Step 2: Split narration audio per segment ─────────────────────────────
console.log("\n══ Step 2: Split narration audio ══\n");
const narrationSrc = join(bundleDir, "narration.mp3");
copyFileSync(narrationSrc, join(outDir, "audio", "narration-full.mp3"));
console.log("  narration-full.mp3");

let audioOffset = 0;
const audioFiles = [];
for (let i = 0; i < segments.length; i++) {
  const seg = segments[i];
  const slug = seg.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
  const num = String(i + 1).padStart(2, "0");
  const audioName = `${num}-${slug}.mp3`;
  const audioPath = join(outDir, "audio", audioName);
  const dur = seg.audioDuration;

  try {
    execSync(
      `ffmpeg -y -i "${narrationSrc}" -ss ${audioOffset.toFixed(3)} -t ${dur.toFixed(3)} -c copy "${audioPath}" 2>/dev/null`,
      { stdio: "pipe" }
    );
    audioFiles.push({ name: audioName, offset: audioOffset, duration: dur });
    console.log(`  ${audioName} (${audioOffset.toFixed(1)}s → ${(audioOffset + dur).toFixed(1)}s)`);
  } catch {
    // -c copy can fail on mp3 boundaries, fall back to re-encode
    execSync(
      `ffmpeg -y -i "${narrationSrc}" -ss ${audioOffset.toFixed(3)} -t ${dur.toFixed(3)} -ab 192k "${audioPath}" 2>/dev/null`,
      { stdio: "pipe" }
    );
    audioFiles.push({ name: audioName, offset: audioOffset, duration: dur });
    console.log(`  ${audioName} (${audioOffset.toFixed(1)}s → ${(audioOffset + dur).toFixed(1)}s) [re-encoded]`);
  }
  audioOffset += dur;
}

// ── Step 3: Subtitles ─────────────────────────────────────────────────────
console.log("\n══ Step 3: Subtitles ══\n");

// Copy VTT if exists
const vttSrc = join(bundleDir, "narration.vtt");
if (existsSync(vttSrc)) {
  copyFileSync(vttSrc, join(outDir, "subtitles", "captions.vtt"));
  console.log("  captions.vtt");
}

// Generate SRT from word timings
const wordTimings = JSON.parse(readFileSync(join(bundleDir, "word-timings.json"), "utf8"));
const srtContent = generateSRT(wordTimings);
writeFileSync(join(outDir, "subtitles", "captions.srt"), srtContent);
console.log("  captions.srt");

// ── Step 4: Assets ────────────────────────────────────────────────────────
console.log("\n══ Step 4: Assets ══\n");

// Copy logo if it exists in the parent output dir
const outputDir = dirname(bundleDir);
for (const ext of ["png", "svg", "webp", "jpg"]) {
  const logoPath = join(outputDir, `logo.${ext}`);
  if (existsSync(logoPath)) {
    copyFileSync(logoPath, join(outDir, "assets", `logo.${ext}`));
    console.log(`  logo.${ext}`);
    break;
  }
}

// Copy final rendered video for reference
const finalSrc = join(bundleDir, "final.mp4");
if (existsSync(finalSrc)) {
  copyFileSync(finalSrc, join(outDir, "assets", "final-rendered.mp4"));
  console.log("  final-rendered.mp4 (reference)");
}

// Copy raw recording
const rawSrc = join(outputDir, "recording.mp4");
if (existsSync(rawSrc)) {
  copyFileSync(rawSrc, join(outDir, "raw", "recording.mp4"));
  console.log("  raw/recording.mp4");
}

// ── Step 5: Probe clip dimensions ─────────────────────────────────────────
let seqWidth = 1920;
let seqHeight = 1080;
if (clipFiles.length > 0) {
  try {
    const probe = execSync(
      `ffprobe -v quiet -show_entries stream=width,height -of csv=p=0 "${join(outDir, "clips", clipFiles[0].name)}"`,
      { encoding: "utf8" }
    ).trim().split("\n")[0];
    const [w, h] = probe.split(",").map(Number);
    if (w && h) { seqWidth = w; seqHeight = h; }
  } catch {}
}

// ── Step 6: Generate FCP7 XML ─────────────────────────────────────────────
console.log("\n══ Step 5: FCP7 XML timeline ══\n");

const fps = 30; // Standard timeline fps
const xml = generateFCP7XML({
  name: demoName,
  fps,
  width: seqWidth,
  height: seqHeight,
  clips: clipFiles,
  audioFiles,
  segments,
  narration,
});

writeFileSync(join(outDir, "timeline.xml"), xml);
console.log(`  timeline.xml (${seqWidth}×${seqHeight} @ ${fps}fps)`);

// ── Step 7: README ────────────────────────────────────────────────────────
console.log("\n══ Step 6: README ══\n");

const readme = generateREADME({
  demoName,
  segments,
  clipFiles,
  audioFiles,
  narration,
  manifest,
  seqWidth,
  seqHeight,
  fps,
});
writeFileSync(join(outDir, "README.txt"), readme);
console.log("  README.txt");

// ── Done ──────────────────────────────────────────────────────────────────
const totalDur = segments.reduce((sum, s) => sum + s.audioDuration, 0);
console.log(`
╔══════════════════════════════════════════╗
║         Editor Export Complete            ║
╠══════════════════════════════════════════╣
║  Output:   editor-export/               ║
║  Clips:    ${String(clipFiles.length).padEnd(29)}║
║  Duration: ${(totalDur.toFixed(1) + "s").padEnd(29)}║
║  Timeline: timeline.xml (FCP7)          ║
╚══════════════════════════════════════════╝

  Import into your editor:
    Premiere Pro: File → Import → select timeline.xml
    DaVinci Resolve: File → Import Timeline → Import AAF, EDL, XML...
    Final Cut Pro: File → Import → XML...
`);


// ═══════════════════════════════════════════════════════════════════════════
// Helper functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate SRT subtitle file from word timings.
 * Groups words into ~8-12 word phrases for readable captions.
 */
function generateSRT(wordTimings) {
  const lines = [];
  let cueIndex = 1;
  const maxWordsPerCue = 10;
  const maxDurationMs = 4000;

  let i = 0;
  while (i < wordTimings.length) {
    const w0 = wordTimings[i].text || wordTimings[i].word;
    if (!w0) { i++; continue; }
    const startMs = wordTimings[i].startMs;
    let endMs = wordTimings[i].endMs;
    const words = [w0];
    i++;

    while (i < wordTimings.length && words.length < maxWordsPerCue) {
      const wN = wordTimings[i].text || wordTimings[i].word;
      if (!wN) { i++; continue; }
      // Break on sentence boundaries
      const lastWord = words[words.length - 1] || "";
      if (lastWord.endsWith(".") || lastWord.endsWith("!") || lastWord.endsWith("?")) break;
      // Break if gap is too long
      if (wordTimings[i].startMs - endMs > 500) break;
      // Break if duration exceeds max
      if (wordTimings[i].endMs - startMs > maxDurationMs) break;

      endMs = wordTimings[i].endMs;
      words.push(wN);
      i++;
    }

    const text = words.join(" ").trim();
    if (!text) continue;

    lines.push(`${cueIndex}`);
    lines.push(`${formatSRTTime(startMs)} --> ${formatSRTTime(endMs)}`);
    lines.push(text);
    lines.push("");
    cueIndex++;
  }

  return lines.join("\n");
}

function formatSRTTime(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const f = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(f).padStart(3, "0")}`;
}

/**
 * Generate FCP7 XML (xmeml v5) timeline.
 *
 * This format is supported by:
 *   - Adobe Premiere Pro (File → Import)
 *   - DaVinci Resolve (File → Import Timeline → Import AAF, EDL, XML...)
 *   - Final Cut Pro 7 / X (File → Import → XML)
 */
function generateFCP7XML({ name, fps, width, height, clips, audioFiles, segments, narration }) {
  let timelineFrame = 0;
  let videoClipItems = "";
  let audioClipItems = "";
  let fileEntries = "";
  const fileIds = {};

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const audio = audioFiles[i];
    const seg = segments[i];
    const dur = seg.audioDuration;
    const durationFrames = Math.round(dur * fps);
    const startFrame = timelineFrame;
    const endFrame = timelineFrame + durationFrames;

    const videoFileId = `video-file-${i + 1}`;
    const audioFileId = `audio-file-${i + 1}`;

    // File definitions
    fileEntries += `
      <file id="${videoFileId}">
        <name>${clip.name}</name>
        <pathurl>clips/${clip.name}</pathurl>
        <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
        <duration>${durationFrames}</duration>
        <media>
          <video>
            <samplecharacteristics>
              <width>${width}</width>
              <height>${height}</height>
            </samplecharacteristics>
          </video>
        </media>
      </file>`;

    fileEntries += `
      <file id="${audioFileId}">
        <name>${audio.name}</name>
        <pathurl>audio/${audio.name}</pathurl>
        <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
        <duration>${durationFrames}</duration>
        <media>
          <audio>
            <samplecharacteristics>
              <samplerate>44100</samplerate>
              <depth>16</depth>
            </samplecharacteristics>
          </audio>
        </media>
      </file>`;

    // Video clip on V1
    const sceneLabel = seg.name || `Segment ${i + 1}`;
    videoClipItems += `
          <clipitem id="video-clip-${i + 1}">
            <name>${escapeXML(sceneLabel)}</name>
            <duration>${durationFrames}</duration>
            <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
            <start>${startFrame}</start>
            <end>${endFrame}</end>
            <in>0</in>
            <out>${durationFrames}</out>
            <file id="${videoFileId}"/>
            <marker>
              <name>${escapeXML(sceneLabel)}</name>
              <comment>${escapeXML(narration.segments[i]?.text || "")}</comment>
              <in>0</in>
              <out>-1</out>
            </marker>
          </clipitem>`;

    // Audio clip on A1
    audioClipItems += `
          <clipitem id="audio-clip-${i + 1}">
            <name>Narration — ${escapeXML(sceneLabel)}</name>
            <duration>${durationFrames}</duration>
            <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
            <start>${startFrame}</start>
            <end>${endFrame}</end>
            <in>0</in>
            <out>${durationFrames}</out>
            <file id="${audioFileId}"/>
          </clipitem>`;

    timelineFrame = endFrame;
  }

  const totalFrames = timelineFrame;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">

  <sequence>
    <name>${escapeXML(name)}</name>
    <duration>${totalFrames}</duration>
    <rate>
      <timebase>${fps}</timebase>
      <ntsc>FALSE</ntsc>
    </rate>
    <timecode>
      <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
      <string>00:00:00:00</string>
      <frame>0</frame>
      <displayformat>NDF</displayformat>
    </timecode>

    <media>
      <video>
        <format>
          <samplecharacteristics>
            <width>${width}</width>
            <height>${height}</height>
            <pixelaspectratio>square</pixelaspectratio>
            <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
          </samplecharacteristics>
        </format>
        <track>
${videoClipItems}
          <enabled>TRUE</enabled>
          <locked>FALSE</locked>
        </track>
      </video>
      <audio>
        <format>
          <samplecharacteristics>
            <samplerate>44100</samplerate>
            <depth>16</depth>
          </samplecharacteristics>
        </format>
        <track>
${audioClipItems}
          <enabled>TRUE</enabled>
          <locked>FALSE</locked>
        </track>
      </audio>
    </media>
  </sequence>

${fileEntries}

</xmeml>
`;
}

function escapeXML(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generate human-readable README.
 */
function generateREADME({ demoName, segments, clipFiles, audioFiles, narration, manifest, seqWidth, seqHeight, fps }) {
  const totalDur = segments.reduce((sum, s) => sum + s.audioDuration, 0);
  const date = new Date().toISOString().split("T")[0];

  let segmentList = "";
  let timePos = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const clip = clipFiles[i];
    const audio = audioFiles[i];
    const text = narration.segments[i]?.text || "";
    const endPos = timePos + seg.audioDuration;
    segmentList += `  ${String(i + 1).padStart(2)}. ${seg.name.padEnd(20)} ${formatTimestamp(timePos)} → ${formatTimestamp(endPos)}  (${seg.audioDuration.toFixed(1)}s)\n`;
    segmentList += `      Video: clips/${clip?.name || "?"}\n`;
    segmentList += `      Audio: audio/${audio?.name || "?"}\n`;
    segmentList += `      Narration: "${text.substring(0, 80)}${text.length > 80 ? "..." : ""}"\n\n`;
    timePos = endPos;
  }

  return `AutoDemo Editor Export
${"═".repeat(50)}

Demo:       ${demoName}
Date:       ${date}
Duration:   ${totalDur.toFixed(1)}s
Segments:   ${segments.length}
Resolution: ${seqWidth}×${seqHeight}
Frame Rate: ${fps}fps

SEGMENTS
${"─".repeat(50)}
${segmentList}
FILES
${"─".repeat(50)}

  timeline.xml        FCP7 XML timeline — import into your editor
  clips/              Speed-matched video clips per segment
  audio/              Per-segment narration + full narration track
  subtitles/          SRT and VTT caption files
  assets/             Logo, rendered reference video
  raw/                Full unedited source recording

HOW TO IMPORT
${"─".repeat(50)}

  Adobe Premiere Pro:
    File → Import → select timeline.xml
    All clips and audio land on V1/A1 already synced.

  DaVinci Resolve:
    File → Import Timeline → Import AAF, EDL, XML...
    Select timeline.xml. Choose "Automatically import source clips."

  Final Cut Pro:
    File → Import → XML...
    Select timeline.xml.

  Any editor:
    Import clips/ and audio/ folders as media.
    Place clips on V1 in order, audio on A1.
    Import subtitles/captions.srt for captions.

RE-RENDER
${"─".repeat(50)}

  To re-render the automated video from this bundle:
  ${manifest.howToReRecord || "See the original narration.json and recording."}

NARRATION METADATA
${"─".repeat(50)}

  Intro tagline:  ${narration.introTagline || "—"}
  Intro subtitle: ${narration.introSubtitle || "—"}
  Outro heading:  ${narration.outroHeading || "—"}
  Outro URL:      ${narration.outroUrl || "—"}
  Accent color:   ${narration.accentColor || "—"}
  Voice:          ${narration.voice || "—"}
  Caption style:  ${narration.captionStyle || "—"}
`;
}

function formatTimestamp(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}
