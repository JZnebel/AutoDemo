#!/usr/bin/env node
/**
 * autodemo — film verified, narrated walkthroughs of a web app.
 *
 *   autodemo <command> <project> [args]
 *
 *   make    <project> <clip ...|--all> [--lang en,fr] [--jobs N] [--queue] [--max-minutes M] [--no-publish]
 *           narration → reset → record (with retakes) → finish, for every clip × language
 *   status  <project>                       the --queue: done, failed, left
 *   tts     <project> <clip> <lang>         synthesise one clip's narration
 *   record  <project> <clip> <lang> [--dry] record one take (narration must exist)
 *   finish  <project> <clip> <lang> [--accept-screen] [--no-cut] [--no-zoom]
 *           checks, edit and render a recorded take
 *   check   <project> <clip> <lang>         screen checks on a recorded take
 *   publish <project> [clip ...]            copy finished clips to the help site's videos folder
 *   ship    <project> [clip ...] [--no-deploy] [--commit]
 *           publish + player on each page + build + deploy
 *
 * <project> is a folder with an autodemo.config.mjs, or the name of one under examples/.
 * See core/project.mjs for what a project provides.
 */
import { spawnSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { projectDir } from "./project.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const [command, projectArg, ...rest] = process.argv.slice(2);
const scripts = {
  make: ["node", "make.mjs"],
  status: ["node", "make.mjs", "--status"],
  tts: ["python3", "tts.py"],
  record: ["node", "run-flow.mjs"],
  finish: ["node", "finish.mjs"],
  check: ["node", "checks.mjs"],
  publish: ["node", "publish.mjs"],
  ship: ["node", "ship.mjs"],
};

if (!scripts[command] || !projectArg) {
  const doc = (await import("fs")).readFileSync(fileURLToPath(import.meta.url), "utf8").match(/\/\*\*([\s\S]*?)\*\//)[1];
  console.log(doc.replace(/^ \* ?/gm, "").trim());
  process.exit(command && !["help", "--help", "-h"].includes(command) ? 1 : 0);
}

const dir = projectDir(projectArg);
const [cmd, script, ...fixed] = scripts[command];
const args = command === "tts" ? [join(here, script), dir, ...rest] : [join(here, script), ...fixed, ...rest];
const r = spawnSync(cmd, args, { stdio: "inherit", env: { ...process.env, AUTODEMO_PROJECT: dir } });
process.exit(r.status ?? 1);
