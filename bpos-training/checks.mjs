/**
 * Screen checks: what was actually on screen while a clip was recorded, checked against what
 * it should show. Runs on raw/<clip>.<lang>.screen.json (the recorder writes it: the visible
 * text once a second and at every narration line, waits, covered clicks), before rendering.
 *
 *   node bpos-training/checks.mjs <clip-id> <lang>      (finish.mjs runs it too)
 *
 * Errors (the take shouldn't be published):
 *   - English app text on screen in a French take (a missing translation)
 *   - another worker's store address on screen (make.mjs --jobs)
 * Warnings (look at the frames):
 *   - a line names a button/label/product that never shows on screen while it's spoken
 *   - a spinner or "busy" state on screen for 3s or more
 *   - something (a toast, a backdrop) drawn over a control as it was clicked
 *
 * A clip can list on-screen text that's fine as it is in "screenAllow" in narration.json.
 */
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { registerLabels } from "./register.mjs";
import { adminLabels } from "./admin.mjs";

const here = dirname(fileURLToPath(import.meta.url));

const squash = (t) => (t || "").replace(/[’‘]/g, "'").replace(/\s+/g, " ").replace(/(…|\.\.\.)$/, "").trim();
const lower = (t) => squash(t).toLowerCase();

let labelCache = null;
function labels() {
  if (labelCache) return labelCache;
  const pairs = [...registerLabels(), ...adminLabels()];
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
function namedIn(text, lang, storeNames) {
  const { english, french } = labels();
  const known = lang === "fr" ? french : english;
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

/**
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function screenChecks(clipId, lang) {
  const errors = [];
  const warnings = [];
  const spec = JSON.parse(readFileSync(join(here, "narration.json"), "utf8"));
  const clip = spec.clips.find((c) => c.id === clipId);
  const screenPath = join(here, "raw", `${clipId}.${lang}.screen.json`);
  if (!existsSync(screenPath)) return { errors, warnings: ["no screen.json — recorded before screen checks existed"] };
  const screen = JSON.parse(readFileSync(screenPath, "utf8"));
  const { marks } = JSON.parse(readFileSync(join(here, "raw", `${clipId}.${lang}.marks.json`), "utf8"));
  const subdomain = screen.subdomain || "riverstone";
  const storeData = join(here, ".local", `store-data.${subdomain}.json`);
  const storeNames = existsSync(storeData) ? JSON.parse(readFileSync(storeData, "utf8")).map(squash) : [];
  const allow = new Set([...(clip.screenAllow || []), ...storeNames].map(squash));
  const fmt = (t) => `${t.toFixed(1)}s`;
  const snaps = screen.snapshots || [];

  // 1. Untranslated text in a French take
  if (lang === "fr") {
    const { untranslated } = labels();
    const seen = new Map();
    for (const s of snaps) {
      for (const t of s.texts) {
        const k = squash(t);
        if (untranslated.has(k) && !allow.has(k) && !seen.has(k)) seen.set(k, s.t);
      }
    }
    for (const [text, t] of seen) errors.push(`English on screen at ${fmt(t)}: "${text}" (not translated? add it to screenAllow if it's meant to be)`);
  }

  // 2. Another worker's store address
  if (subdomain !== "riverstone") {
    const leak = snaps.find((s) => s.texts.some((t) => t.includes(subdomain)));
    if (leak) errors.push(`the worker store's address "${subdomain}" is on screen at ${fmt(leak.t)} — run this clip with --jobs 1`);
  }

  // 3. Lines naming something that isn't on screen while they're spoken
  const order = clip.lines.map((l) => l.id).filter((id) => id in marks);
  order.forEach((id, i) => {
    const line = clip.lines.find((l) => l.id === id);
    const from = marks[id] - 1;
    const to = (i + 1 < order.length ? marks[order[i + 1]] : Infinity) + 1.5;
    const visible = snaps.filter((s) => s.t >= from && s.t <= to).flatMap((s) => s.texts.map(lower));
    if (!visible.length) return;
    for (const name of namedIn(line[lang] || "", lang, storeNames)) {
      const want = lower(name);
      if (!visible.some((v) => v.includes(want))) {
        warnings.push(`line "${id}" names "${name}", but it isn't on screen while that line is spoken (${fmt(marks[id])})`);
      }
    }
  });

  // 4. Spinners / busy states held on screen
  let run = null;
  for (const s of [...snaps].sort((a, b) => a.t - b.t)) {
    if (s.busy) run = run || { start: s.t, what: s.busy, end: s.t };
    if (s.busy) run.end = s.t;
    if ((!s.busy || s === snaps.at(-1)) && run) {
      if (run.end - run.start >= 3) warnings.push(`"${run.what}" busy on screen ${fmt(run.start)}–${fmt(run.end)}`);
      run = null;
    }
  }

  // 5. Clicks with something drawn over them
  for (const issue of screen.issues || []) {
    if (issue.kind === "covered") warnings.push(`at ${fmt(issue.t)} "${issue.detail}" was over ${issue.sel} as it was clicked`);
  }

  return { errors, warnings };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [clipId, lang] = process.argv.slice(2);
  const { printCheck } = await import("../lib/quality-checks.mjs");
  const r = screenChecks(clipId, lang);
  printCheck(`${clipId} [${lang}] screen`, r);
  process.exitCode = r.errors.length ? 1 : 0;
}
