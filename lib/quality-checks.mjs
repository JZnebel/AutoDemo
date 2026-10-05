/**
 * Quality checks shared by the render pipelines (autodemo.mjs, screencast-pipeline.mjs).
 *
 * Every check returns { errors: string[], warnings: string[], ... } so callers can
 * decide whether to abort. Errors mean the video is wrong; warnings mean "look at it".
 *
 *   validateNarration   — narration.json sanity before any TTS/render work
 *   checkSegmentSpeeds  — footage-vs-narration speed factors (blur-by / slow-mo)
 *   checkTranscript     — Whisper transcript vs the script (truncation, spoken punctuation)
 *   masterLoudness      — two-pass EBU R128 loudnorm of a finished video, in place
 *   reviewRender        — post-render probe: streams, duration, black/frozen/silent spans, sample frames
 */

import { spawnSync } from "child_process";
import { existsSync, mkdirSync, renameSync, statSync, unlinkSync } from "fs";
import { join } from "path";

// ─────────────────────────────────────────────────────────────────────
// Narration validation
// ─────────────────────────────────────────────────────────────────────

/**
 * @param {object} narration - parsed narration.json
 * @param {{ rawDurationSec?: number }} opts - raw recording duration, if known
 */
export function validateNarration(narration, { rawDurationSec } = {}) {
  const errors = [];
  const warnings = [];
  const segments = narration?.segments || [];

  if (segments.length === 0) {
    errors.push("narration.json has no segments");
    return { errors, warnings };
  }

  segments.forEach((seg, i) => {
    if (!seg.text?.trim()) errors.push(`${segName(seg, i)}: empty text`);
  });

  // fullText drives TTS; segment texts drive segment timing. If they disagree,
  // segment boundaries won't be found in the audio.
  const joined = norm(segments.map((s) => s.text || "").join(" "));
  if (!narration.fullText?.trim()) {
    errors.push("fullText is missing — it's what gets sent to TTS");
  } else if (norm(narration.fullText) !== joined) {
    warnings.push("fullText differs from the segment texts joined — segment timing may not match the audio");
  }

  // Footage ranges
  const timed = segments
    .map((seg, i) => ({ seg, i, start: seg.videoStartSec, end: seg.videoEndSec }))
    .filter((t) => t.start != null || t.end != null);

  if (timed.length > 0 && timed.length < segments.length) {
    warnings.push(`${segments.length - timed.length} of ${segments.length} segments have no videoStartSec/videoEndSec — their footage will be guessed`);
  }

  for (const { seg, i, start, end } of timed) {
    const name = segName(seg, i);
    if (start != null && start < 0) errors.push(`${name}: videoStartSec ${start} is negative`);
    if (start != null && end != null && end <= start) {
      errors.push(`${name}: videoEndSec (${end}) is not after videoStartSec (${start})`);
    }
    if (rawDurationSec && start != null && start >= rawDurationSec) {
      errors.push(`${name}: videoStartSec ${start}s is past the end of the recording (${rawDurationSec.toFixed(1)}s)`);
    } else if (rawDurationSec && end != null && end > rawDurationSec + 0.25) {
      warnings.push(`${name}: videoEndSec ${end}s is past the end of the recording (${rawDurationSec.toFixed(1)}s) — will be clamped`);
    }
  }

  // Overlaps (reusing the same footage twice is almost always a typo)
  const ranges = timed
    .filter((t) => t.start != null && t.end != null && t.end > t.start)
    .sort((a, b) => a.start - b.start);
  for (let k = 1; k < ranges.length; k++) {
    const prev = ranges[k - 1];
    const cur = ranges[k];
    const overlap = prev.end - cur.start;
    if (overlap > 0.25) {
      warnings.push(
        `${segName(prev.seg, prev.i)} (${prev.start}-${prev.end}s) and ${segName(cur.seg, cur.i)} (${cur.start}-${cur.end}s) overlap by ${overlap.toFixed(1)}s — the same footage will play twice`,
      );
    }
  }

  return { errors, warnings };
}

// ─────────────────────────────────────────────────────────────────────
// Speed factors
// ─────────────────────────────────────────────────────────────────────

// Matches the clamp in lib/video-editor.mjs — beyond this, footage and narration drift apart.
const SPEED_HARD_MIN = 0.25;
const SPEED_HARD_MAX = 8;
// Beyond these it still syncs but looks bad (UI blurs past / looks frozen).
const SPEED_SOFT_MIN = 0.5;
const SPEED_SOFT_MAX = 4;

/**
 * @param {{ label: string, footageSec: number, audioSec: number }[]} items
 */
export function checkSegmentSpeeds(items) {
  const errors = [];
  const warnings = [];
  const speeds = [];

  for (const { label, footageSec, audioSec } of items) {
    if (!(footageSec > 0) || !(audioSec > 0)) continue;
    const speed = footageSec / audioSec;
    speeds.push({ label, footageSec, audioSec, speed });

    if (speed > SPEED_SOFT_MAX) {
      const fix = `add ~${Math.round(((footageSec / SPEED_SOFT_MAX - audioSec) * 150) / 60)} words of narration or trim the footage to ~${(audioSec * SPEED_SOFT_MAX).toFixed(1)}s`;
      const msg = `${label}: ${footageSec.toFixed(1)}s of footage under ${audioSec.toFixed(1)}s of narration plays at ${speed.toFixed(1)}x — ${fix}`;
      (speed > SPEED_HARD_MAX ? errors : warnings).push(msg);
    } else if (speed < SPEED_SOFT_MIN) {
      const fix = `widen the footage range to ~${(audioSec * SPEED_SOFT_MIN).toFixed(1)}s or shorten the narration`;
      const msg = `${label}: ${footageSec.toFixed(1)}s of footage under ${audioSec.toFixed(1)}s of narration plays at ${speed.toFixed(2)}x (slow motion) — ${fix}`;
      (speed < SPEED_HARD_MIN ? errors : warnings).push(msg);
    }
  }

  return { errors, warnings, speeds };
}

// ─────────────────────────────────────────────────────────────────────
// Transcript vs script
// ─────────────────────────────────────────────────────────────────────

const SPOKEN_PUNCTUATION = new Set([
  "dash", "hyphen", "slash", "backslash", "ellipsis", "asterisk", "underscore",
  "semicolon", "colon", "bullet", "pipe", "dot",
]);
const TLDS = new Set(["com", "ca", "io", "ai", "net", "org", "app", "dev", "co", "uk", "us", "so", "sh", "xyz"]);

/**
 * Compare Whisper word timings against the narration script.
 * Catches truncated TTS (missing tail), dropped sentences, and TTS reading punctuation aloud.
 *
 * @param {{ text: string, startMs: number }[]} wordTimings
 * @param {string} fullText
 */
export function checkTranscript(wordTimings, fullText) {
  const errors = [];
  const warnings = [];
  const heard = wordTimings
    .flatMap((w) => tokenize(w.text).map((t) => ({ w: t, startMs: w.startMs })))
    .filter((w) => w.w);
  const script = tokenize(fullText);

  if (script.length === 0) return { errors, warnings, coverage: 1 };
  if (heard.length === 0) {
    errors.push("Whisper heard no words in the narration audio");
    return { errors, warnings, coverage: 0 };
  }

  // In-order alignment via longest common subsequence, so a misheard word
  // ("wet way" for "wet weight") can't pull the match onto a later repeat.
  const S = script.length;
  const H = heard.length;
  const lcs = Array.from({ length: S + 1 }, () => new Uint16Array(H + 1));
  for (let s = S - 1; s >= 0; s--) {
    for (let k = H - 1; k >= 0; k--) {
      lcs[s][k] = wordsMatch(script[s], heard[k].w)
        ? lcs[s + 1][k + 1] + 1
        : Math.max(lcs[s + 1][k], lcs[s][k + 1]);
    }
  }
  const matched = new Array(S).fill(false);
  for (let s = 0, k = 0; s < S && k < H; ) {
    if (wordsMatch(script[s], heard[k].w) && lcs[s][k] === lcs[s + 1][k + 1] + 1) {
      matched[s++] = true;
      k++;
    } else if (lcs[s + 1][k] >= lcs[s][k + 1]) {
      s++;
    } else {
      k++;
    }
  }

  const coverage = matched.filter(Boolean).length / script.length;
  const pct = `${(coverage * 100).toFixed(0)}%`;
  if (coverage < 0.75) errors.push(`only ${pct} of the script was heard in the narration audio`);
  else if (coverage < 0.85) warnings.push(`only ${pct} of the script was heard in the narration audio`);

  // The ending is the most common place for TTS to cut off.
  const tail = matched.slice(-5);
  if (script.length >= 10 && tail.filter(Boolean).length <= 1) {
    errors.push(`the narration audio seems truncated — the last words "${script.slice(-5).join(" ")}" were not heard`);
  }

  // Long runs of unheard words → a dropped sentence.
  let runStart = -1;
  for (let s = 0; s <= script.length; s++) {
    if (s < script.length && !matched[s]) {
      if (runStart < 0) runStart = s;
    } else if (runStart >= 0) {
      if (s - runStart >= 6 && s !== script.length) {
        warnings.push(`not heard in the audio: "${script.slice(runStart, s).join(" ")}"`);
      }
      runStart = -1;
    }
  }

  // Punctuation read aloud ("dash", "slash"...) that isn't in the script.
  const scriptCounts = countWords(script);
  const seen = new Map();
  heard.forEach((w, i) => {
    if (!SPOKEN_PUNCTUATION.has(w.w)) return;
    if (w.w === "dot" && TLDS.has(heard[i + 1]?.w)) return; // "example dot com" is fine
    const n = (seen.get(w.w) || 0) + 1;
    seen.set(w.w, n);
    if (n > (scriptCounts.get(w.w) || 0)) {
      warnings.push(`TTS said "${w.w}" at ${(w.startMs / 1000).toFixed(1)}s — punctuation read aloud? Reword that spot in the script`);
    }
  });

  return { errors, warnings, coverage };
}

// ─────────────────────────────────────────────────────────────────────
// Loudness mastering
// ─────────────────────────────────────────────────────────────────────

/**
 * Two-pass EBU R128 loudness normalization of a video's audio track, in place.
 * Video stream is copied untouched. Default target: -16 LUFS integrated, -1.5 dBTP
 * (web/social standard).
 *
 * @returns {{ inputI: number, outputI: number } | null} null if skipped
 */
export function masterLoudness(videoPath, { targetI = -16, targetTP = -1.5, targetLRA = 11 } = {}) {
  const base = `I=${targetI}:TP=${targetTP}:LRA=${targetLRA}`;

  const pass1 = spawnSync("ffmpeg", [
    "-hide_banner", "-nostats", "-i", videoPath,
    "-af", `loudnorm=${base}:print_format=json`, "-vn", "-f", "null", "-",
  ], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const measured = parseLastJson(pass1.stderr);
  if (!measured || !isFinite(parseFloat(measured.input_i))) return null; // no audio / silent

  const tmp = videoPath.replace(/(\.\w+)$/, ".loudnorm$1");
  const pass2 = spawnSync("ffmpeg", [
    "-hide_banner", "-y", "-i", videoPath,
    "-map", "0:v?", "-map", "0:a",
    "-c:v", "copy",
    "-af", `loudnorm=${base}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`,
    "-ar", "48000", "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart",
    tmp,
  ], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

  if (pass2.status !== 0 || !existsSync(tmp)) {
    if (existsSync(tmp)) unlinkSync(tmp);
    throw new Error(`loudnorm pass 2 failed: ${(pass2.stderr || "").split("\n").slice(-3).join(" ")}`);
  }
  renameSync(tmp, videoPath);

  return { inputI: parseFloat(measured.input_i), outputI: targetI };
}

// ─────────────────────────────────────────────────────────────────────
// Post-render review
// ─────────────────────────────────────────────────────────────────────

/**
 * Probe a finished render and flag anything a viewer would notice.
 * Writes sample frames to `reviewDir` so the agent (or a human) can eyeball them.
 *
 * @param {string} videoPath
 * @param {{ reviewDir: string, expectedDurationSec?: number, frameCount?: number }} opts
 */
export function reviewRender(videoPath, { reviewDir, expectedDurationSec, frameCount = 8 } = {}) {
  const errors = [];
  const warnings = [];
  const result = { errors, warnings, video: null, audio: null, black: [], frozen: [], silent: [], frames: [] };

  if (!existsSync(videoPath)) {
    errors.push(`output file does not exist: ${videoPath}`);
    return result;
  }

  // 1. Streams + duration
  const probe = spawnSync("ffprobe", [
    "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", videoPath,
  ], { encoding: "utf8" });
  let info;
  try {
    info = JSON.parse(probe.stdout);
  } catch {
    errors.push("ffprobe could not read the output — file is corrupt");
    return result;
  }
  const v = info.streams?.find((s) => s.codec_type === "video");
  const a = info.streams?.find((s) => s.codec_type === "audio");
  const duration = parseFloat(info.format?.duration || "0");
  result.durationSec = duration;

  if (!v) errors.push("no video stream");
  else result.video = { codec: v.codec_name, width: v.width, height: v.height };
  if (!a) errors.push("no audio stream");
  else result.audio = { codec: a.codec_name, sampleRate: +a.sample_rate };
  if (duration < 1) errors.push(`duration is ${duration.toFixed(2)}s`);

  if (expectedDurationSec && duration > 0) {
    const off = Math.abs(duration - expectedDurationSec) / expectedDurationSec;
    const msg = `duration ${duration.toFixed(1)}s vs expected ${expectedDurationSec.toFixed(1)}s (${(off * 100).toFixed(0)}% off)`;
    if (off > 0.25) errors.push(msg);
    else if (off > 0.1) warnings.push(msg);
  }

  if (!v || duration < 1) return result;

  // 2. One decode pass: black + frozen video, loudness stats + silence
  const scan = spawnSync("ffmpeg", [
    "-hide_banner", "-nostats", "-i", videoPath,
    "-vf", "blackdetect=d=1.5:pic_th=0.98:pix_th=0.08,freezedetect=n=-60dB:d=4",
    ...(a ? ["-af", "volumedetect,silencedetect=n=-45dB:d=3"] : ["-an"]),
    "-f", "null", "-",
  ], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  const log = scan.stderr || "";

  for (const m of log.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)/g)) {
    result.black.push({ startSec: +m[1], endSec: +m[2] });
  }
  const blackTotal = result.black.reduce((t, b) => t + (b.endSec - b.startSec), 0);
  if (blackTotal > duration * 0.5) errors.push(`${blackTotal.toFixed(1)}s of the video is black`);
  for (const b of result.black) {
    warnings.push(`black screen ${fmt(b.startSec)}–${fmt(b.endSec)}`);
  }

  const freezeStarts = [...log.matchAll(/freeze_start: ([\d.]+)/g)].map((m) => +m[1]);
  const freezeEnds = [...log.matchAll(/freeze_end: ([\d.]+)/g)].map((m) => +m[1]);
  freezeStarts.forEach((start, k) => {
    const end = freezeEnds[k] ?? duration;
    result.frozen.push({ startSec: start, endSec: end });
    // Intro/outro cards often hold still — only flag freezes in the body of the video
    if ((start < 0.5 && end <= 10) || (end >= duration - 0.5 && start >= duration - 10)) return;
    warnings.push(`frozen picture ${fmt(start)}–${fmt(end)} (${(end - start).toFixed(1)}s) — missed frames or footage slowed to a crawl?`);
  });

  if (a) {
    const mean = parseFloat(log.match(/mean_volume: (-?[\d.]+) dB/)?.[1]);
    const max = parseFloat(log.match(/max_volume: (-?[\d.]+) dB/)?.[1]);
    result.audio.meanDb = mean;
    result.audio.maxDb = max;
    if (!isFinite(mean) || mean < -45) errors.push(`audio is silent (mean ${isFinite(mean) ? mean : "-inf"} dB)`);
    else if (max >= -0.1) warnings.push(`audio peaks at ${max} dB — clipping`);

    const silStarts = [...log.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1]);
    const silEnds = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
    silStarts.forEach((start, k) => {
      const end = silEnds[k] ?? duration;
      result.silent.push({ startSec: start, endSec: end });
      if (start > 1 && end < duration - 1) {
        warnings.push(`no audio ${fmt(start)}–${fmt(end)} (${(end - start).toFixed(1)}s)`);
      }
    });
  }

  // 3. Sample frames for visual review
  if (reviewDir) {
    mkdirSync(reviewDir, { recursive: true });
    for (let k = 0; k < frameCount; k++) {
      const t = ((k + 0.5) / frameCount) * duration;
      const out = join(reviewDir, `frame-${String(k + 1).padStart(2, "0")}-${t.toFixed(1)}s.jpg`);
      spawnSync("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y", "-ss", t.toFixed(2), "-i", videoPath,
        "-frames:v", "1", "-vf", "scale=960:-2", "-q:v", "4", out,
      ]);
      if (existsSync(out)) {
        result.frames.push(out);
        if (statSync(out).size < 4000) warnings.push(`frame at ${fmt(t)} is nearly blank (${out})`);
      }
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────
// Reporting
// ─────────────────────────────────────────────────────────────────────

export function printCheck(title, { errors = [], warnings = [] }) {
  if (errors.length === 0 && warnings.length === 0) {
    console.log(`  ✓ ${title}: OK`);
    return;
  }
  console.log(`  ${errors.length ? "✗" : "~"} ${title}: ${errors.length} error(s), ${warnings.length} warning(s)`);
  for (const e of errors) console.log(`      ✗ ${e}`);
  for (const w of warnings) console.log(`      ~ ${w}`);
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function segName(seg, i) {
  return seg.sceneLabel ? `segment ${i} "${seg.sceneLabel}"` : `segment ${i}`;
}

function norm(s) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function normWord(w) {
  return (w || "").toLowerCase().replace(/[’]/g, "'").replace(/[^a-z0-9']/g, "");
}

function tokenize(text) {
  // Split on whitespace and on hyphens/slashes, which TTS reads as separate words
  return (text || "").split(/[\s\-–—/]+/).map(normWord).filter(Boolean);
}

function wordsMatch(a, b) {
  if (a === b) return true;
  // Whisper drops/keeps possessives and plurals inconsistently
  const strip = (w) => w.replace(/'s$|s$|'/g, "");
  return strip(a) === strip(b) && strip(a).length > 1;
}

function countWords(words) {
  const m = new Map();
  for (const w of words) m.set(w, (m.get(w) || 0) + 1);
  return m;
}

function parseLastJson(text) {
  const start = (text || "").lastIndexOf("{");
  const end = (text || "").lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1).padStart(4, "0");
  return `${m}:${s}`;
}
