/**
 * Make clips end to end: narration, a fresh store, record, render, publish to the docs.
 *
 *   node bpos-training/make.mjs <clip-id ...|--all> [--lang en,fr] [--no-publish]
 *
 * Starts its own headless Chrome if none is listening on the configured port. A take the
 * runner throws away (the register showed Offline, say) is retried twice.
 */
import { execFileSync, spawn } from "child_process";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { CONFIG, browserArgs } from "./config.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const langs = (opt("--lang") || "en,fr").split(",");
const spec = JSON.parse(readFileSync(join(here, "narration.json"), "utf8"));
const ids = args.includes("--all") ? spec.clips.map((c) => c.id)
  : args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--lang");
if (!ids.length) { console.error("usage: make.mjs <clip-id ...|--all> [--lang en,fr] [--no-publish]"); process.exit(1); }

const step = (cmd, a) => execFileSync(cmd, a, { cwd: join(here, ".."), stdio: "inherit" });

async function ensureChrome() {
  const up = () => fetch(`http://127.0.0.1:${CONFIG.chromePort}/json/version`).then((r) => r.ok, () => false);
  if (await up()) return;
  spawn("google-chrome", browserArgs(), { detached: true, stdio: "ignore" }).unref();
  for (let i = 0; i < 30 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500));
  if (!(await up())) throw new Error("Chrome didn't start");
}

/** The dev server can be restarted under us (other work shares it): wait for it. */
async function serverUp() {
  for (let i = 0; i < 60; i++) {
    if (await fetch(`${CONFIG.localBase}/up`).then((r) => r.ok, () => false)) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`${CONFIG.localBase} isn't answering`);
}

await ensureChrome();
const failed = [];
for (const id of ids) {
  const clip = spec.clips.find((c) => c.id === id);
  if (!clip) throw new Error(`no clip ${id}`);
  const flow = await import(join(here, clip.flow));
  for (const lang of langs) {
    console.log(`\n=== ${id} [${lang}] ===`);
    step("python3", [join(here, "tts.py"), id, lang]);
    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      try {
        await serverUp();
        step("node", [join(here, "seed.mjs"), ...(flow.meta.seed || []), `--lang=${lang}`]);
        step("node", [join(here, "run-flow.mjs"), id, lang]);
        ok = true;
      } catch {
        console.log(`take ${attempt} failed${attempt < 3 ? ", trying again" : ""}`);
      }
    }
    if (!ok) {
      // Don't let one clip stop the batch: note it and carry on.
      failed.push(`${id} [${lang}]`);
      console.log(`${id} [${lang}]: three takes failed — see the REC_LOG and raw/${id}.${lang}.failed.png`);
      continue;
    }
    step("node", [join(here, "finish.mjs"), id, lang]);
  }
}
if (!args.includes("--no-publish")) step("node", [join(here, "publish.mjs"), ...ids]);
if (failed.length) {
  console.log(`\nNOT MADE: ${failed.join(", ")}`);
  process.exitCode = 1;
}
