/**
 * Ship clips to the live help site in one go: publish the videos, put the player on each
 * clip's docs page, build the site, and swap the build in on the server.
 *
 *   node bpos-training/ship.mjs [clip-id ...] [--no-deploy] [--commit]
 *
 *   1. publish.mjs: videos + manifest into the docs' static/videos/
 *   2. Each clip's page (narration.json "docs") gets <TrainingVideo id="..."/> under its intro
 *      paragraph, if it doesn't have it yet.
 *   3. npm run build in the knowledge base (Node from nvm, as the docs need).
 *   4. rsync the build to <deployDir>/build.new on the server, then swap it in (the old one
 *      is kept as build.prev) and check each page answers. Skipped with --no-deploy, or when
 *      config.local.json has no "deployHost".
 *   --commit: commit the pages step 2 changed, in the bpos repo.
 *
 * Server settings live in config.local.json (gitignored — this repo is public):
 *   { "deployHost": "user@host", "deployDir": "apps/brotherpos/knowledge-base", "docsUrl": "https://..." }
 */
import { execFileSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const local = existsSync(join(here, "config.local.json")) ? JSON.parse(readFileSync(join(here, "config.local.json"), "utf8")) : {};
const videos = resolve(process.env.BT_DOCS_VIDEOS || local.docsVideos || join(here, "..", "..", "bpos", "knowledge-base", "static", "videos"));
const kb = resolve(videos, "..", "..");
const spec = JSON.parse(readFileSync(join(here, "narration.json"), "utf8"));
const ids = args.filter((a) => !a.startsWith("--"));
const clips = spec.clips.filter((c) => !ids.length || ids.includes(c.id));
const sh = (cmd, a, opts = {}) => execFileSync(cmd, a, { stdio: "inherit", ...opts });

/** The page with the player under its intro: the first ordinary paragraph after the page's
 *  # heading (not the role badges). null if the page has no such paragraph. */
export function addPlayer(text, id) {
  const lines = text.split("\n");
  const h1 = lines.findIndex((l) => /^# /.test(l));
  if (h1 < 0) return null;
  for (let i = h1 + 1; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l || l.startsWith("<span") || l.startsWith("import ") || l.startsWith(":::")) continue;
    if (l.startsWith("#")) return null;
    let end = i;
    while (end + 1 < lines.length && lines[end + 1].trim()) end++;
    // Another clip's player already under the intro: stack this one below it
    while (lines[end + 1]?.trim() === "" && /^<TrainingVideo /.test(lines[end + 2]?.trim() || "")) {
      end += 2;
      while (/^<TrainingVideo /.test(lines[end + 1]?.trim() || "")) end++;
    }
    lines.splice(end + 1, 0, "", `<TrainingVideo id="${id}" />`);
    return lines.join("\n");
  }
  return null;
}

if (process.argv[1] !== fileURLToPath(import.meta.url)) { /* imported for addPlayer */ } else {

// 1. Videos
sh("node", [join(here, "publish.mjs"), ...ids]);
const manifest = JSON.parse(readFileSync(join(videos, "manifest.json"), "utf8"));

// 2. Players on the pages
const changed = [];
for (const c of clips) {
  if (!manifest[c.id] || !c.docs) continue;
  const page = [".md", ".mdx"].map((x) => join(kb, "docs", c.docs + x)).find(existsSync);
  if (!page) { console.log(`${c.id}: no page docs/${c.docs}.md — add the player by hand`); continue; }
  const text = readFileSync(page, "utf8");
  if (text.includes(`<TrainingVideo id="${c.id}"`)) continue;
  const next = addPlayer(text, c.id);
  if (!next) { console.log(`${c.id}: couldn't find the intro on ${page} — add the player by hand`); continue; }
  writeFileSync(page, next);
  changed.push(page);
  console.log(`${c.id}: player added to docs/${c.docs}`);
}

// 3. Build
sh("bash", ["-lc", "source ~/.nvm/nvm.sh >/dev/null && nvm use 24 >/dev/null && npm run build"], { cwd: kb });

// 4. Deploy
if (args.includes("--no-deploy") || !local.deployHost) {
  console.log(args.includes("--no-deploy") ? "Built, not deployed (--no-deploy)." : 'Built, not deployed: set "deployHost" in config.local.json.');
} else {
  const dir = local.deployDir || "apps/brotherpos/knowledge-base";
  sh("rsync", ["-az", "--delete", `${join(kb, "build")}/`, `${local.deployHost}:${dir}/build.new/`]);
  sh("ssh", [local.deployHost, `cd ${dir} && rm -rf build.prev && mv build build.prev && mv build.new build && echo swapped`]);
  if (local.docsUrl) {
    for (const c of clips.filter((x) => x.docs && manifest[x.id])) {
      const url = `${local.docsUrl.replace(/\/$/, "")}/${c.docs}`;
      const code = execFileSync("curl", ["-s", "-L", "-o", "/dev/null", "-w", "%{http_code}", url], { encoding: "utf8" });
      console.log(`${code === "200" ? "ok " : "!! "} ${code} ${url}`);
    }
  }
}

// --commit
if (args.includes("--commit") && changed.length) {
  const repo = execFileSync("git", ["-C", kb, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  sh("git", ["-C", repo, "add", ...changed]);
  sh("git", ["-C", repo, "commit", "-q", "-m", `Docs: training videos on ${changed.length} more page${changed.length > 1 ? "s" : ""}`]);
  console.log(`committed ${changed.length} page(s) in ${repo}`);
}
}
