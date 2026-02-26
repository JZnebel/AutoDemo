/**
 * Convert character-level alignment to word-level timing.
 *
 * @param {object} alignment - ElevenLabs alignment object
 * @param {number[]} alignment.character_start_times_seconds
 * @param {number[]} alignment.character_end_times_seconds
 * @param {string[]} alignment.characters
 * @returns {Array<{word: string, startSec: number, endSec: number}>}
 */
export function charsToWords(alignment) {
  const chars = alignment.characters || [];
  const starts = alignment.character_start_times_seconds || [];
  const ends = alignment.character_end_times_seconds || [];
  const words = [];
  let current = "";
  let wordStart = 0;

  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === " " || chars[i] === "\n") {
      if (current.length > 0) {
        words.push({
          word: current,
          startSec: wordStart,
          endSec: ends[i - 1] || wordStart,
        });
        current = "";
      }
    } else {
      if (current.length === 0) wordStart = starts[i] || 0;
      current += chars[i];
    }
  }

  if (current.length > 0) {
    words.push({
      word: current,
      startSec: wordStart,
      endSec: ends[chars.length - 1] || wordStart,
    });
  }

  return words;
}

/**
 * Group words into caption lines of approximately maxChars length.
 *
 * @param {Array<{word: string, startSec: number, endSec: number}>} words
 * @param {object} [opts]
 * @param {number} [opts.maxChars=42] - Target max characters per caption line
 * @param {number} [opts.minChars=20] - Minimum characters before allowing a break
 * @returns {Array<{text: string, startSec: number, endSec: number}>}
 */
export function groupCaptions(words, opts = {}) {
  const maxChars = opts.maxChars ?? 42;
  const captions = [];
  let line = "";
  let lineStart = 0;
  let lineEnd = 0;

  for (const w of words) {
    const candidate = line ? `${line} ${w.word}` : w.word;
    if (candidate.length > maxChars && line.length > 0) {
      captions.push({ text: line, startSec: lineStart, endSec: lineEnd });
      line = w.word;
      lineStart = w.startSec;
      lineEnd = w.endSec;
    } else {
      if (!line) lineStart = w.startSec;
      line = candidate;
      lineEnd = w.endSec;
    }
  }

  if (line) {
    captions.push({ text: line, startSec: lineStart, endSec: lineEnd });
  }

  return captions;
}

/**
 * Format seconds as SRT timestamp: HH:MM:SS,mmm
 */
function srtTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

/**
 * Format seconds as VTT timestamp: HH:MM:SS.mmm
 */
function vttTime(sec) {
  return srtTime(sec).replace(",", ".");
}

/**
 * Generate SRT subtitle content from caption groups.
 *
 * @param {Array<{text: string, startSec: number, endSec: number}>} captions
 * @param {number} [offset=0] - Seconds to add to all timestamps (for scene offsets)
 * @returns {string}
 */
export function toSRT(captions, offset = 0) {
  return captions
    .map((c, i) => {
      const start = srtTime(c.startSec + offset);
      const end = srtTime(c.endSec + offset);
      return `${i + 1}\n${start} --> ${end}\n${c.text}\n`;
    })
    .join("\n");
}

/**
 * Generate WebVTT subtitle content from caption groups.
 *
 * @param {Array<{text: string, startSec: number, endSec: number}>} captions
 * @param {number} [offset=0] - Seconds to add to all timestamps (for scene offsets)
 * @returns {string}
 */
export function toVTT(captions, offset = 0) {
  const cues = captions
    .map((c) => {
      const start = vttTime(c.startSec + offset);
      const end = vttTime(c.endSec + offset);
      return `${start} --> ${end}\n${c.text}`;
    })
    .join("\n\n");
  return `WEBVTT\n\n${cues}\n`;
}

/**
 * High-level: generate captions from ElevenLabs alignment data.
 * Handles multi-scene offsets when provided.
 *
 * @param {object} alignment - ElevenLabs alignment data
 * @param {object} [opts]
 * @param {number} [opts.offset=0] - Scene offset in seconds for multi-scene stitching
 * @param {number} [opts.maxChars=42] - Max characters per caption line
 * @param {"srt"|"vtt"} [opts.format="srt"] - Output format
 * @returns {{captions: Array, output: string}}
 */
export function generateCaptions(alignment, opts = {}) {
  const offset = opts.offset ?? 0;
  const format = opts.format ?? "srt";

  const words = charsToWords(alignment);
  const captions = groupCaptions(words, { maxChars: opts.maxChars });
  const output = format === "vtt" ? toVTT(captions, offset) : toSRT(captions, offset);

  return { captions, output };
}
