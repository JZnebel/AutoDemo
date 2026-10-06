/**
 * Editing decisions for a training clip, made from what the recorder logged
 * (raw/<clip>.<lang>.screen.json) — used by finish.mjs.
 *
 *   deadTime()  stretches where the viewer would only watch our dev server think (a save
 *               that takes 8s, a page that won't stop loading) while nobody is speaking:
 *               cut down to a short beat.
 *   zooms()     a light zoom onto what each line is about, so table text and small
 *               buttons read on a phone.
 */
import { execFileSync, spawnSync } from "child_process";

const HEAD = 0.5;      // seconds of a dead stretch kept at its start (so the action reads)
const TAIL = 0.3;      // ...and at its end (so the result doesn't pop in)
const MIN_CUT = 0.8;   // don't bother cutting less than this

/** Spans [start, end] (seconds) of `video` where the picture doesn't change. */
export function frozenSpans(video, minSec = 1.5) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", video, "-vf", `freezedetect=n=-60dB:d=${minSec}`,
    "-an", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return parseFreezes(r.stderr || "");
}

function parseFreezes(log) {
  const starts = [...log.matchAll(/freeze_start: ([\d.]+)/g)].map((m) => +m[1]);
  const ends = [...log.matchAll(/freeze_end: ([\d.]+)/g)].map((m) => +m[1]);
  return starts.map((s, i) => [s, ends[i] ?? Infinity]);
}

function merge(spans) {
  const out = [];
  for (const [a, b] of [...spans].sort((x, y) => x[0] - y[0])) {
    if (out.length && a <= out.at(-1)[1] + 0.05) out.at(-1)[1] = Math.max(out.at(-1)[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** Remove the parts of `spans` that overlap `holes`. */
function subtract(spans, holes) {
  let rest = spans;
  for (const [ha, hb] of holes) {
    rest = rest.flatMap(([a, b]) => {
      if (hb <= a || ha >= b) return [[a, b]];
      return [[a, ha], [hb, b]].filter(([x, y]) => y - x > 0.01);
    });
  }
  return rest;
}

/**
 * @param {object} p
 * @param {[number, number][]} p.speech   when narration is heard (never cut)
 * @param {[number, number][]} p.waits    the recorder's server waits (screen.busy)
 * @param {[number, number][]} p.frozen   frozen-picture spans
 * @param {number[]} [p.actions]          when each click/type happened (never cut: the
 *                                        pointer's approach and the click itself)
 * @param {number} p.duration             clip length
 * @returns {[number, number][]} spans to remove
 */
export function deadTime({ speech, waits, frozen, actions = [], duration }) {
  const candidates = merge([...waits, ...frozen].map(([a, b]) => [Math.max(a, 1), Math.min(b, duration - 1.5)]).filter(([a, b]) => b > a));
  const keep = [...speech.map(([a, b]) => [a - 0.15, b + 0.25]), ...actions.map((t) => [t - 1.4, t + 0.8])];
  const quietOnes = subtract(candidates, keep);
  return quietOnes
    .map(([a, b]) => [a + HEAD, b - TAIL])
    .filter(([a, b]) => b - a >= MIN_CUT)
    .map(([a, b]) => [Math.round(a * 100) / 100, Math.round(b * 100) / 100]);
}

/** Where time `t` lands once `cuts` are removed. */
export function shift(t, cuts) {
  let out = t;
  for (const [a, b] of cuts) {
    if (t >= b) out -= b - a;
    else if (t > a) out -= t - a;
  }
  return out;
}

/** Cut `cuts` out of `src` into `dest` (constant 25fps, no audio). */
export function applyCuts(src, dest, cuts, fps = 25) {
  const keep = cuts.map(([a, b]) => `between(t,${a},${b})`).join("+");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", src,
    "-vf", `select='not(${keep})',setpts=N/${fps}/TB`, "-r", String(fps), "-an",
    "-c:v", "libx264", "-crf", "16", "-preset", "veryfast", "-pix_fmt", "yuv420p", dest]);
}

/**
 * A zoom per narration line onto the controls it works with, when they sit in a small
 * part of the screen.
 *
 * @param {object} p
 * @param {{t: number, box: number[]}[]} p.actions  what each action pointed at (already shifted)
 * @param {number[]} p.starts   line start times, in order (already shifted)
 * @param {number} p.duration
 * @param {number} p.width
 * @param {number} p.height
 * @returns {{from: number, to: number, x: number, y: number, scale: number}[]}  seconds, source px
 */
export function zooms({ actions, starts, duration, width, height, maxScale = 1.4, minScale = 1.15 }) {
  const out = [];
  starts.forEach((from, i) => {
    const to = i + 1 < starts.length ? starts[i + 1] : duration;
    const acts = actions.filter((a) => a.t >= from - 0.2 && a.t < to && a.box);
    if (!acts.length) return;
    let x0 = Math.min(...acts.map((a) => a.box[0])), y0 = Math.min(...acts.map((a) => a.box[1]));
    let x1 = Math.max(...acts.map((a) => a.box[0] + a.box[2])), y1 = Math.max(...acts.map((a) => a.box[1] + a.box[3]));
    // Room around it for the pointer and what the control is about (a label, a total)
    x0 -= 220; x1 += 220; y0 -= 150; y1 += 150;
    const scale = Math.min(maxScale, width / (x1 - x0), height / (y1 - y0));
    if (scale < minScale) return;
    const s = Math.round(scale * 100) / 100;
    // Centre, kept far enough in that the zoomed frame never shows past the recording's edge
    const half = (n, sc) => n / (2 * sc);
    const x = Math.round(Math.min(Math.max((x0 + x1) / 2, half(width, s)), width - half(width, s)));
    const y = Math.round(Math.min(Math.max((y0 + y1) / 2, half(height, s)), height - half(height, s)));
    // Start as the pointer heads for the first control; hold until the next line.
    const start = Math.max(from, acts[0].t - 1.2);
    const prev = out.at(-1);
    if (prev && start - prev.to < 0.4 && Math.abs(prev.x - x) < 60 && Math.abs(prev.y - y) < 60 && Math.abs(prev.scale - s) < 0.08) {
      prev.to = to;   // same spot as the last line: keep holding rather than zoom out and back
    } else {
      out.push({ from: Math.round(start * 100) / 100, to: Math.round(to * 100) / 100, x, y, scale: s });
    }
  });
  return out;
}
