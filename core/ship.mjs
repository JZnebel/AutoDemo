/**
 * Ship clips to a Docusaurus help site in one go: publish the videos, put the player on each
 * clip's docs page, build the site, and swap the build in on the server.
 *
 *   node core/cli.mjs ship <project> [clip-id ...] [--no-deploy] [--commit]
 *
 *   1. publish.mjs: videos + manifest into config.docs.videos
 *   2. Each clip's page (narration.json "docs") gets <TrainingVideo id="..."/> under its intro
 *      paragraph, if it doesn't have it yet.
 *   3. config.docs.build in the site's folder (config.docs.root).
 *   4. rsync the build to <deploy.dir>/build.new on deploy.host, then swap it in (the old one
 *      is kept as build.prev) and check each page answers at deploy.url. Skipped with
 *      --no-deploy, or when there's no config.docs.deploy.host.
 *   --commit: commit the pages step 2 changed, in the site's repo.
 *
 * Keep the server settings out of a public repo: the BrotherPOS example reads them from its
 * gitignored config.local.json.
 */
import { execFileSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const here = fileURLToPath(new URL(".", import.meta.url));
const args = process.argv.slice(2);
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

const { loadProject } = await import("./project.mjs");
const project = await loadProject();
const docs = project.config.docs;
if (!docs?.videos || !docs?.root) { console.log("this project has no config.docs (videos, root) — nothing to ship to"); process.exit(0); }
const { videos, root: kb } = docs;
const deploy = docs.deploy || {};
const ids = args.filter((a) => !a.startsWith("--"));
const clips = project.spec.clips.filter((c) => !ids.length || ids.includes(c.id));

// 1. Videos
sh("node", [join(here, "publish.mjs"), ...ids], { env: { ...process.env, AUTODEMO_PROJECT: project.dir } });
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
sh("bash", ["-lc", docs.build || "npm run build"], { cwd: kb });

// 4. Deploy
if (args.includes("--no-deploy") || !deploy.host) {
  console.log(args.includes("--no-deploy") ? "Built, not deployed (--no-deploy)." : "Built, not deployed: no config.docs.deploy.host.");
} else {
  const dir = deploy.dir;
  sh("rsync", ["-az", "--delete", `${join(kb, "build")}/`, `${deploy.host}:${dir}/build.new/`]);
  sh("ssh", [deploy.host, `cd ${dir} && rm -rf build.prev && mv build build.prev && mv build.new build && echo swapped`]);
  if (deploy.url) {
    for (const c of clips.filter((x) => x.docs && manifest[x.id])) {
      const url = `${deploy.url.replace(/\/$/, "")}/${c.docs}`;
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
