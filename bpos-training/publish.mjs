/**
 * Copy finished clips into the docs site and update its manifest.
 *
 *   node bpos-training/publish.mjs [clip-id ...]     (default: every clip in out/)
 *
 * The docs' <TrainingVideo id="..."> player reads static/videos/manifest.json to know which
 * clips and languages exist. Set the docs folder with `docsVideos` in config.local.json or
 * BT_DOCS_VIDEOS (default: ../bpos/knowledge-base/static/videos beside this repo).
 */
import { execFileSync } from "child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const local = existsSync(join(here, "config.local.json")) ? JSON.parse(readFileSync(join(here, "config.local.json"), "utf8")) : {};
const dest = resolve(process.env.BT_DOCS_VIDEOS || local.docsVideos || join(here, "..", "..", "bpos", "knowledge-base", "static", "videos"));
const spec = JSON.parse(readFileSync(join(here, "narration.json"), "utf8"));
const LANGS = ["en", "fr"];

const wanted = process.argv.slice(2);
const clips = spec.clips.filter((c) => !wanted.length || wanted.includes(c.id));
mkdirSync(dest, { recursive: true });
const manifestPath = join(dest, "manifest.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};

for (const c of clips) {
  const entry = { title: c.title, seconds: {} };
  for (const lang of LANGS) {
    const mp4 = join(here, "out", `${c.id}.${lang}.mp4`);
    const jpg = join(here, "out", `${c.id}.${lang}.jpg`);
    if (!existsSync(mp4) || !existsSync(jpg)) continue;
    copyFileSync(mp4, join(dest, `${c.id}.${lang}.mp4`));
    copyFileSync(jpg, join(dest, `${c.id}.${lang}.jpg`));
    entry.seconds[lang] = Math.round(Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration",
      "-of", "csv=p=0", mp4], { encoding: "utf8" }).trim()));
  }
  if (!Object.keys(entry.seconds).length) { console.log(`${c.id}: nothing rendered yet, skipped`); continue; }
  manifest[c.id] = entry;
  console.log(`${c.id}: ${Object.entries(entry.seconds).map(([l, s]) => `${l} ${s}s`).join(", ")}`);
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
console.log(`-> ${dest}`);
