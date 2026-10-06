/**
 * Screen checks: what was actually on screen while a clip was recorded, checked against what
 * it should show. Runs on raw/<clip>.<lang>.screen.json (the recorder writes it: the visible
 * text once a second and at every narration line, waits, covered clicks), before rendering.
 *
 *   node core/cli.mjs check <project> <clip-id> <lang>      (finish.mjs runs it too)
 *
 * Errors (the take shouldn't be published):
 *   - source-language UI text on screen in a translated take (a missing translation): from
 *     the app's own strings (config.labels()), and for English apps a heuristic for text the
 *     strings don't know about (hard-coded words, English dates, "$20.00")
 *   - a --jobs worker's marker (its store address) on screen
 * Warnings (look at the frames):
 *   - a line names a button/label/product that never shows on screen while it's spoken
 *   - a spinner or "busy" state on screen for 3s or more
 *   - something (a toast, a backdrop) drawn over a control as it was clicked
 *
 * Text that's fine as it is: config.allowedText() (store data, names) and a clip's
 * "screenAllow" list in narration.json.
 */
import { loadProject, loadTake } from "./project.mjs";
import { fileURLToPath } from "url";

const squash = (t) => (t || "").replace(/[’‘]/g, "'").replace(/\s+/g, " ").replace(/(…|\.\.\.)$/, "").trim();
const lower = (t) => squash(t).toLowerCase();

let labelCache = null;
function labels(config) {
  if (labelCache) return labelCache;
  const pairs = config.labels ? config.labels() : [];
  const french = new Set();
  const english = new Set();
  for (const [en, fr] of pairs) {
    fr.forEach((f) => french.add(squash(f)));
    english.add(squash(en));
  }
  // English text whose French is different: seeing it in a French take means it wasn't translated.
  const untranslated = new Set();
  for (const [en, fr] of pairs) {
    const e = squash(en);
    if (e.length >= 4 && /\p{L}{3}/u.test(e) && !e.includes("%{") && !fr.some((f) => squash(f) === e) && !french.has(e)) {
      untranslated.add(e);
    }
  }
  labelCache = { english, french, untranslated };
  return labelCache;
}

/** UI labels, quoted text and store names that a narration line names. */
function namedIn(config, text, translated, storeNames) {
  const { english, french } = labels(config);
  const known = translated ? french : english;
  const found = new Set();
  // Quoted: "Complete Sale", « Dons », “Save”
  for (const m of text.matchAll(/["“«]\s*([^"”»]{2,40}?)\s*["”»]/g)) found.add(squash(m[1]));
  // Store data (product, customer names) mentioned by name
  for (const n of storeNames) if (n.length >= 4 && text.includes(n)) found.add(n);
  // Known labels, written as on screen: several words, or one capitalised word mid-sentence
  for (const label of known) {
    if (label.length < 4 || !/\p{Lu}/u.test(label[0])) continue;
    const at = text.indexOf(label);
    if (at < 0) continue;
    const before = text[at - 1], after = text[at + label.length];
    if ((before && /[\p{L}\d]/u.test(before)) || (after && /[\p{L}\d]/u.test(after))) continue;   // part of a longer word
    const multiword = label.includes(" ");
    const sentenceStart = at === 0 || /[.!?:—–]\s*$/.test(text.slice(Math.max(0, at - 3), at));
    if (multiword || !sentenceStart) found.add(label);
  }
  // Drop ones contained in a longer one also found ("Sale" inside "Complete Sale")
  return [...found].filter((f) => ![...found].some((g) => g !== f && g.includes(f)));
}

// Words that are English and never French, so two of them in one piece of text mean English.
const EN_WORDS = new Set("the your you and with from this that when will are is of to for on it be or not all by have has only my me our we they their what which how than then into out up off any each per its was were been can should would could if no yes save edit view show hide enable enabled disable disabled".split(" "));
const EN_DATE = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}(, \d{4}|,? \d{1,2}:\d{2})/;
const EN_TIME = /\b\d{1,2}:\d{2} ?(AM|PM)\b/;
const EN_MONEY = /(^|[\s(])-?\$\d/;
function looksEnglish(text) {
  if (EN_DATE.test(text) || EN_TIME.test(text) || EN_MONEY.test(text)) return true;
  const words = text.toLowerCase().match(/[a-z']+/g) || [];
  if (words.length < 2) return false;
  const hits = new Set(words.filter((w) => EN_WORDS.has(w)));
  return hits.size >= 2 && hits.size / words.length >= 0.15;
}

/**
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function screenChecks(project, clipId, lang) {
  const errors = [];
  const warnings = [];
  const { config } = project;
  const clip = project.clip(clipId);
  let take;
  try { take = loadTake(project, clipId, lang); } catch { return { errors, warnings: ["no marks.json — not recorded yet"] }; }
  if (!take.shots.some((s) => s.snapshots)) return { errors, warnings: ["no screen.json — recorded before screen checks existed"] };
  const source = config.languages[0];
  const translated = lang !== source;
  const storeNames = (config.allowedText ? config.allowedText(take.worker) : []).map(squash);
  const allow = new Set([...(clip.screenAllow || []), ...storeNames].map(squash));
  const fmt = (t, i) => `${t.toFixed(1)}s${take.shots.length > 1 ? ` (shot ${i + 1})` : ""}`;

  take.shots.forEach((shot, si) => {
    const snaps = shot.snapshots || [];
    const marks = shot.marks || {};

    // 1. Source-language text in a translated take
    if (translated) {
      const { untranslated } = labels(config);
      const seen = new Map();
      for (const s of snaps) {
        for (const t of s.texts) {
          const k = squash(t);
          if (allow.has(k) || seen.has(k) || /^(https?:|<|\/|[\w.+-]+@)/.test(k)) continue;
          // The app's own strings; for an English app also text the strings can't know about:
          // hard-coded in a view or script, English dates ("Oct 05, 2026"), "$20.00".
          if (untranslated.has(k) || (source === "en" && looksEnglish(k))) seen.set(k, s.t);
        }
      }
      for (const [text, t] of seen) errors.push(`${source.toUpperCase()} text on screen at ${fmt(t, si)}: "${text.slice(0, 90)}" (not translated? add it to screenAllow if it's meant to be)`);
    }

    // 2. A --jobs worker's marker (its own store address) on screen
    if (take.worker.k > 1 && take.worker.marker) {
      const leak = snaps.find((s) => s.texts.some((t) => t.includes(take.worker.marker)));
      if (leak) errors.push(`worker ${take.worker.k}'s "${take.worker.marker}" is on screen at ${fmt(leak.t, si)} — record this clip with --jobs 1, or set meta.worker1`);
    }

    // 3. Lines naming something that isn't on screen while they're spoken
    const order = clip.lines.map((l) => l.id).filter((id) => id in marks).sort((a, b) => marks[a] - marks[b]);
    order.forEach((id, i) => {
      const line = clip.lines.find((l) => l.id === id);
      const from = marks[id] - 1;
      const to = (i + 1 < order.length ? marks[order[i + 1]] : Infinity) + 1.5;
      const visible = snaps.filter((s) => s.t >= from && s.t <= to).flatMap((s) => s.texts.map(lower));
      if (!visible.length) return;
      for (const name of namedIn(config, line[lang] || "", translated, storeNames)) {
        const want = lower(name);
        if (!visible.some((v) => v.includes(want))) {
          warnings.push(`line "${id}" names "${name}", but it isn't on screen while that line is spoken (${fmt(marks[id], si)})`);
        }
      }
    });

    // 4. Spinners / busy states held on screen
    let run = null;
    const sorted = [...snaps].sort((a, b) => a.t - b.t);
    for (const s of sorted) {
      if (s.busy) run = run || { start: s.t, what: s.busy, end: s.t };
      if (s.busy) run.end = s.t;
      if ((!s.busy || s === sorted.at(-1)) && run) {
        if (run.end - run.start >= 3) warnings.push(`"${run.what}" busy on screen ${fmt(run.start, si)}–${run.end.toFixed(1)}s`);
        run = null;
      }
    }

    // 5. Clicks with something drawn over them
    for (const issue of shot.issues || []) {
      if (issue.kind === "covered") warnings.push(`at ${fmt(issue.t, si)} "${issue.detail}" was over ${issue.sel} as it was clicked`);
    }
  });

  return { errors, warnings };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [clipId, lang] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const { printCheck } = await import("../lib/quality-checks.mjs");
  const r = screenChecks(await loadProject(), clipId, lang);
  printCheck(`${clipId} [${lang}] screen`, r);
  process.exitCode = r.errors.length ? 1 : 0;
}
