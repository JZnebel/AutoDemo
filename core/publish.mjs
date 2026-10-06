/**
 * Copy finished clips into the docs site and update its manifest.
 *
 *   node core/cli.mjs publish <project> [clip-id ...]     (default: every clip in out/)
 *
 * The docs' <TrainingVideo id="..."> player reads <videos>/manifest.json to know which clips
 * and languages exist. The folder is config.docs.videos.
 */
import { execFileSync } from "child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { loadProject } from "./project.mjs";

const project = await loadProject();
if (!project.config.docs?.videos) { console.log("this project has no config.docs.videos — nothing to publish to"); process.exit(0); }
const dest = project.config.docs.videos;
const spec = project.spec;
const LANGS = project.config.languages;

const wanted = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const clips = spec.clips.filter((c) => !wanted.length || wanted.includes(c.id));
mkdirSync(dest, { recursive: true });
const manifestPath = join(dest, "manifest.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};

for (const c of clips) {
  const entry = { title: c.title, seconds: {} };
  for (const lang of LANGS) {
    const mp4 = project.out(`${c.id}.${lang}.mp4`);
    const jpg = project.out(`${c.id}.${lang}.jpg`);
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
