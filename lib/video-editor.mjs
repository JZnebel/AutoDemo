import { readFileSync } from "fs";
import { execSync } from "child_process";

/**
 * Parse a timeline JSONL file into unified segments.
 *
 * Each JSONL line has: { id, tool, params, offsetMs, classification, type, durationMs }
 * Start entries (type="start") and end entries (type="end") are combined by ID into:
 *   { tool, params, classification, startMs, endMs, durationMs }
 *
 * @param {string} jsonlPath - Path to the timeline JSONL file
 * @returns {{ tool: string, params: any, classification: string, startMs: number, endMs: number, durationMs: number }[]}
 */
export function parseTimeline(jsonlPath) {
  console.log("📋 Parsing timeline JSONL…");

  const raw = readFileSync(jsonlPath, "utf8").trim();
  if (!raw) {
    console.log("  ⚠️  Empty timeline file");
    return [];
  }

  const lines = raw.split("\n").map((l) => JSON.parse(l));

  // Group by id
  const byId = new Map();
  for (const entry of lines) {
    if (!byId.has(entry.id)) {
      byId.set(entry.id, {});
    }
    const group = byId.get(entry.id);
    if (entry.type === "start") {
      group.start = entry;
    } else if (entry.type === "end") {
      group.end = entry;
    } else {
      // Single entry without start/end — treat as both
      group.start = group.start || entry;
      group.end = group.end || entry;
    }
  }

  const segments = [];
  for (const [id, group] of byId) {
    const start = group.start;
    const end = group.end;
    if (!start) continue;

    const startMs = start.offsetMs ?? 0;
    const endMs = end
      ? (end.offsetMs ?? startMs) + (end.durationMs ?? 0)
      : startMs + (start.durationMs ?? 0);

    segments.push({
      tool: start.tool,
      params: start.params,
      classification: start.classification ?? "action",
      startMs,
      endMs: Math.max(endMs, startMs),
      durationMs: Math.max(endMs - startMs, 0),
    });
  }

  segments.sort((a, b) => a.startMs - b.startMs);
  console.log(`  ✅ Parsed ${segments.length} segments (${segments[0]?.startMs ?? 0}ms – ${segments[segments.length - 1]?.endMs ?? 0}ms)`);
  return segments;
}

/**
 * Build an Edit Decision List from parsed segments.
 *
 * @param {{ tool: string, params: any, classification: string, startMs: number, endMs: number, durationMs: number }[]} segments
 * @param {object} [opts]
 * @param {number} [opts.speedLoading=6] - Speed multiplier for loading segments
 * @param {number} [opts.speedDead=4] - Speed multiplier for short dead time
 * @param {number} [opts.cutThreshold=3000] - Dead time longer than this is cut entirely
 * @returns {{ inputStartMs: number, inputEndMs: number, outputSpeed: number }[]}
 */
export function buildEditList(segments, opts = {}) {
  console.log("✂️  Building edit decision list…");

  const speedLoading = opts.speedLoading ?? 6;
  const speedDead = opts.speedDead ?? 4;
  const cutThreshold = opts.cutThreshold ?? 3000;

  if (segments.length === 0) {
    console.log("  ⚠️  No segments — empty edit list");
    return [];
  }

  const rawEdits = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    // Gap before this segment (from previous segment's end or timeline start)
    const prevEnd = i === 0 ? seg.startMs : segments[i - 1].endMs;
    const gapMs = seg.startMs - prevEnd;

    if (gapMs > 0) {
      // Classify the gap based on what follows
      const gapSpeed = classifyGap(gapMs, seg, cutThreshold, speedLoading, speedDead);
      rawEdits.push({
        inputStartMs: prevEnd,
        inputEndMs: seg.startMs,
        outputSpeed: gapSpeed,
      });
    }

    // The segment itself
    const isLoading = seg.classification === "loading" ||
      seg.tool === "wait_for" ||
      seg.tool === "navigation";
    const segSpeed = isLoading ? speedLoading : 1;

    rawEdits.push({
      inputStartMs: seg.startMs,
      inputEndMs: seg.endMs,
      outputSpeed: segSpeed,
    });
  }

  // Filter out zero-length segments
  const nonEmpty = rawEdits.filter((e) => e.inputEndMs > e.inputStartMs);

  // Filter out segments shorter than 200ms in input time
  const minDuration = nonEmpty.filter(
    (e) => (e.inputEndMs - e.inputStartMs) >= 200 || e.outputSpeed === 0
  );

  // Merge adjacent segments with same speed
  const merged = mergeAdjacentEdits(minDuration);

  const kept = merged.filter((e) => e.outputSpeed !== 0);
  const cutCount = merged.length - kept.length;
  console.log(`  ✅ ${merged.length} edit segments (${kept.length} kept, ${cutCount} cut)`);

  return merged;
}

/**
 * Classify a gap between segments.
 * @returns {number} speed (0 = cut, 1 = normal, >1 = speedup)
 */
function classifyGap(gapMs, nextSegment, cutThreshold, speedLoading, speedDead) {
  // Gap before an action tool: keep at 1x
  if (nextSegment.classification === "action") {
    return 1;
  }

  // Gap before a loading tool: speed up
  if (
    nextSegment.classification === "loading" ||
    nextSegment.tool === "wait_for" ||
    nextSegment.tool === "navigation"
  ) {
    return speedLoading;
  }

  // Otherwise it's dead time (observe, thinking, etc.)
  if (gapMs < 500) {
    return 1; // Natural pause — keep at 1x
  }
  if (gapMs > cutThreshold) {
    return 0; // Cut entirely
  }
  return speedDead; // Speed up
}

/**
 * Merge adjacent edit segments that have the same output speed.
 */
function mergeAdjacentEdits(edits) {
  if (edits.length === 0) return [];

  const merged = [{ ...edits[0] }];
  for (let i = 1; i < edits.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = edits[i];
    if (prev.outputSpeed === curr.outputSpeed && prev.inputEndMs === curr.inputStartMs) {
      prev.inputEndMs = curr.inputEndMs;
    } else {
      merged.push({ ...curr });
    }
  }
  return merged;
}

/**
 * Apply an edit list to a video using ffmpeg trim+setpts+concat filtergraph.
 *
 * @param {string} inputPath - Path to input video
 * @param {{ inputStartMs: number, inputEndMs: number, outputSpeed: number }[]} editList
 * @param {string} outputPath - Path for the output video
 * @param {object} [opts]
 * @returns {{ durationSec: number, editMap: { inputMs: number, outputMs: number, speed: number }[] }}
 */
export function editVideo(inputPath, editList, outputPath, opts = {}) {
  console.log("🎬 Applying edits to video…");

  // Filter out cuts (speed=0) for the filtergraph
  const keptSegments = editList.filter((e) => e.outputSpeed !== 0);

  if (keptSegments.length === 0) {
    console.log("  ⚠️  No segments to keep — nothing to render");
    return { durationSec: 0, editMap: [] };
  }

  // Build filtergraph
  const filterParts = [];
  const streamLabels = [];

  for (let i = 0; i < keptSegments.length; i++) {
    const seg = keptSegments[i];
    const startSec = (seg.inputStartMs / 1000).toFixed(4);
    const endSec = (seg.inputEndMs / 1000).toFixed(4);
    const label = `v${i}`;

    let setpts;
    if (seg.outputSpeed === 1) {
      setpts = "PTS-STARTPTS";
    } else {
      setpts = `(PTS-STARTPTS)/${seg.outputSpeed}`;
    }

    filterParts.push(
      `[0:v]trim=start=${startSec}:end=${endSec},setpts=${setpts}[${label}]`
    );
    streamLabels.push(`[${label}]`);
  }

  // Build filtergraph with scale for even dimensions (required by h264)
  const scale = "scale=trunc(iw/2)*2:trunc(ih/2)*2";

  let filterComplex;
  if (keptSegments.length === 1) {
    // Single segment — no concat needed, chain scale directly
    const seg = keptSegments[0];
    const startSec = (seg.inputStartMs / 1000).toFixed(4);
    const endSec = (seg.inputEndMs / 1000).toFixed(4);
    const setpts = seg.outputSpeed === 1
      ? "PTS-STARTPTS"
      : `(PTS-STARTPTS)/${seg.outputSpeed}`;
    filterComplex = `[0:v]trim=start=${startSec}:end=${endSec},setpts=${setpts},${scale}[outv]`;
  } else {
    filterComplex =
      filterParts.join(";\n") +
      `;\n${streamLabels.join("")}concat=n=${keptSegments.length}:v=1:a=0,${scale}[outv]`;
  }

  // Build the ffmpeg command
  const cmd = [
    "ffmpeg", "-y",
    "-i", inputPath,
    "-filter_complex", filterComplex,
    "-map", "[outv]",
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    outputPath,
  ];

  console.log(`  ▸ Rendering ${keptSegments.length} segments…`);
  execSync(cmd.map(shellEscape).join(" ") + " 2>/dev/null");

  // Probe the output duration
  const durationSec = probeVideoDuration(outputPath);

  // Build the edit map (input→output time mapping at each boundary)
  const editMap = buildEditMap(editList);

  console.log(`  ✅ Output: ${durationSec.toFixed(1)}s → ${outputPath}`);
  return { durationSec, editMap };
}

/**
 * Build a mapping from input timestamps to output timestamps.
 * @param {{ inputStartMs: number, inputEndMs: number, outputSpeed: number }[]} editList
 * @returns {{ inputMs: number, outputMs: number, speed: number }[]}
 */
function buildEditMap(editList) {
  const map = [];
  let outputMs = 0;

  for (const seg of editList) {
    map.push({
      inputMs: seg.inputStartMs,
      outputMs,
      speed: seg.outputSpeed,
    });

    if (seg.outputSpeed > 0) {
      const inputDuration = seg.inputEndMs - seg.inputStartMs;
      outputMs += inputDuration / seg.outputSpeed;
    }
    // speed=0 (cut) contributes nothing to output time
  }

  return map;
}

/**
 * Get video duration in seconds via ffprobe.
 *
 * @param {string} path - Path to the video file
 * @returns {number} Duration in seconds
 */
export function probeVideoDuration(path) {
  const out = execSync(
    `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${path}"`,
    { encoding: "utf8" }
  ).trim();

  const duration = parseFloat(out);
  if (isNaN(duration)) {
    throw new Error(`Could not determine duration for: ${path}`);
  }
  return duration;
}

/**
 * Build an edit list where video segments are stretched/compressed to match narration timing.
 *
 * Instead of classifying segments as "loading" or "action" and applying fixed speed multipliers,
 * this function calculates per-segment speeds so that each video clip's playback duration
 * exactly matches its narration segment's spoken duration. Gaps between narration placements
 * (e.g., AI generation wait time, long pauses) are either cut entirely or sped up at max speed.
 *
 * @param {object[]} timelineSegments - from parseTimeline(), used for context but not directly
 *   for speed calculation (narrationPlacements already reference raw video times)
 * @param {object[]} narrationPlacements - array of { videoStartSec, videoEndSec, narrationDurationSec }
 *   videoStartSec/videoEndSec: the time range in the RAW video that this narration covers
 *   narrationDurationSec: how long the narration segment takes to speak
 * @param {number} rawVideoDurationSec - total raw video duration
 * @param {object} [opts]
 * @param {number} [opts.minSpeed=0.25] - Minimum speed (most slow-motion allowed)
 * @param {number} [opts.maxSpeed=8] - Maximum speed (fastest fast-forward allowed)
 * @param {number} [opts.gapCutThresholdSec=2] - Gaps longer than this are cut; shorter ones are sped up at maxSpeed
 * @param {number} [opts.gapSpeed] - Speed for short gaps (defaults to maxSpeed)
 * @returns {{ inputStartMs: number, inputEndMs: number, outputSpeed: number }[]}
 */
export function buildNarrationDrivenEditList(timelineSegments, narrationPlacements, rawVideoDurationSec, opts = {}) {
  console.log("✂️  Building narration-driven edit list…");

  const minSpeed = opts.minSpeed ?? 0.25;
  const maxSpeed = opts.maxSpeed ?? 8;
  const gapCutThresholdSec = opts.gapCutThresholdSec ?? 2;
  const gapSpeed = opts.gapSpeed ?? maxSpeed;

  if (!narrationPlacements || narrationPlacements.length === 0) {
    console.log("  ⚠️  No narration placements — empty edit list");
    return [];
  }

  // Sort placements by video start time
  const sorted = [...narrationPlacements].sort((a, b) => a.videoStartSec - b.videoStartSec);

  const rawEdits = [];

  for (let i = 0; i < sorted.length; i++) {
    const placement = sorted[i];
    const prevEndSec = i === 0 ? 0 : sorted[i - 1].videoEndSec;

    // Handle gap before this placement
    const gapSec = placement.videoStartSec - prevEndSec;
    if (gapSec > 0.05) { // ignore tiny floating-point gaps
      if (gapSec > gapCutThresholdSec) {
        // Cut long gaps entirely (speed = 0)
        rawEdits.push({
          inputStartMs: Math.round(prevEndSec * 1000),
          inputEndMs: Math.round(placement.videoStartSec * 1000),
          outputSpeed: 0,
        });
      } else {
        // Speed up short gaps
        rawEdits.push({
          inputStartMs: Math.round(prevEndSec * 1000),
          inputEndMs: Math.round(placement.videoStartSec * 1000),
          outputSpeed: gapSpeed,
        });
      }
    }

    // Calculate speed for this narration-covered segment
    const videoClipDurationSec = placement.videoEndSec - placement.videoStartSec;
    const narrationDurationSec = placement.narrationDurationSec;

    if (videoClipDurationSec <= 0 || narrationDurationSec <= 0) {
      // Degenerate placement — skip it
      console.log(`  ⚠️  Skipping degenerate placement: video=${videoClipDurationSec.toFixed(2)}s, narration=${narrationDurationSec.toFixed(2)}s`);
      continue;
    }

    // speed = videoClipDuration / narrationDuration
    // If video is 15s and narration is 5s → speed 3x (fast forward through it)
    // If video is 2s and narration is 4s → speed 0.5x (slow motion to fill narration time)
    let speed = videoClipDurationSec / narrationDurationSec;

    // Clamp to safe range
    const clampedSpeed = Math.max(minSpeed, Math.min(maxSpeed, speed));
    if (clampedSpeed !== speed) {
      console.log(`  ⚠️  Clamped speed ${speed.toFixed(2)}x → ${clampedSpeed.toFixed(2)}x for segment at ${placement.videoStartSec.toFixed(1)}s`);
      speed = clampedSpeed;
    }

    rawEdits.push({
      inputStartMs: Math.round(placement.videoStartSec * 1000),
      inputEndMs: Math.round(placement.videoEndSec * 1000),
      outputSpeed: Math.round(speed * 1000) / 1000, // 3 decimal places
    });
  }

  // Handle trailing gap after the last placement
  const lastEnd = sorted[sorted.length - 1].videoEndSec;
  if (rawVideoDurationSec - lastEnd > 0.05) {
    const trailingGap = rawVideoDurationSec - lastEnd;
    if (trailingGap > gapCutThresholdSec) {
      rawEdits.push({
        inputStartMs: Math.round(lastEnd * 1000),
        inputEndMs: Math.round(rawVideoDurationSec * 1000),
        outputSpeed: 0,
      });
    } else {
      rawEdits.push({
        inputStartMs: Math.round(lastEnd * 1000),
        inputEndMs: Math.round(rawVideoDurationSec * 1000),
        outputSpeed: gapSpeed,
      });
    }
  }

  // Filter out zero-length segments
  const nonEmpty = rawEdits.filter((e) => e.inputEndMs > e.inputStartMs);

  // Merge adjacent segments with same speed
  const merged = mergeAdjacentEdits(nonEmpty);

  const kept = merged.filter((e) => e.outputSpeed !== 0);
  const cutCount = merged.length - kept.length;

  // Calculate expected output duration
  let expectedOutputSec = 0;
  for (const seg of merged) {
    if (seg.outputSpeed > 0) {
      expectedOutputSec += (seg.inputEndMs - seg.inputStartMs) / 1000 / seg.outputSpeed;
    }
  }

  console.log(`  ✅ ${merged.length} edit segments (${kept.length} kept, ${cutCount} cut)`);
  console.log(`  Expected output: ${expectedOutputSec.toFixed(1)}s (from ${rawVideoDurationSec.toFixed(1)}s raw)`);

  // Log per-segment details
  for (const placement of sorted) {
    const clipDur = placement.videoEndSec - placement.videoStartSec;
    const speed = clipDur / placement.narrationDurationSec;
    const clamped = Math.max(minSpeed, Math.min(maxSpeed, speed));
    const outputDur = clipDur / clamped;
    console.log(`    ${placement.videoStartSec.toFixed(1)}s–${placement.videoEndSec.toFixed(1)}s (${clipDur.toFixed(1)}s video) → ${clamped.toFixed(2)}x → ${outputDur.toFixed(1)}s output (narration: ${placement.narrationDurationSec.toFixed(1)}s)`);
  }

  return merged;
}

/**
 * Escape a string for shell use.
 */
function shellEscape(s) {
  if (/^[a-zA-Z0-9._\-/:=]+$/.test(s)) return s;
  return `'${s.replace(/'/g, "'\\''")}'`;
}
