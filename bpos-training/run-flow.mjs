/**
 * Record one clip in one language.
 *
 *   node bpos-training/run-flow.mjs <clip-id> <lang> [--dry]
 *
 * Needs the narration synthesised first (tts.py) — the recording is paced to it. Writes
 * raw/<clip>.<lang>.mp4 (put back on real time) and raw/<clip>.<lang>.marks.json (where
 * each narration line starts, in seconds). --dry rehearses without recording.
 */
import { execFileSync } from "child_process";
import { readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { connect, makeCtx, record, log } from "./recorder.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const [clipId, lang] = process.argv.slice(2);
const dry = process.argv.includes("--dry");
if (!clipId || !lang) { console.error("usage: run-flow.mjs <clip-id> <lang> [--dry]"); process.exit(1); }

const spec = JSON.parse(readFileSync(join(here, "narration.json"), "utf8"));
const clip = spec.clips.find((c) => c.id === clipId);
if (!clip) throw new Error(`no clip ${clipId} in narration.json`);
const durations = JSON.parse(readFileSync(join(here, "audio", clipId, lang, "durations.json"), "utf8"));
const flow = await import(join(here, clip.flow));

const { browser, page } = await connect(flow.meta.viewport ?? {});
const ctx = makeCtx(page, { durations });
page.on("pageerror", (e) => log("PAGE EXC: " + String(e).slice(0, 160)));
// A failed request is how the register decides it's offline, which then shows on camera.
page.on("requestfailed", (r) => log(`REQ FAILED ${r.failure()?.errorText} ${r.method()} ${r.url().slice(0, 140)}`));
page.on("response", (r) => { if (r.status() >= 500) log(`HTTP ${r.status()} ${r.request().method()} ${r.url().slice(0, 140)}`); });
page.on("dialog", async (d) => {
  log(`dialog (${d.type()}) auto-accepted: ${d.message().slice(0, 60)}`);
  await d.accept().catch(() => {});
});

const raw = join(here, "raw", `${clipId}.${lang}.mp4`);
try {
  log(`=== ${clipId} [${lang}] : setup ===`);
  await flow.setup(ctx, { lang });
  log(`=== ${clipId} [${lang}] : ${dry ? "run (dry)" : "record"} ===`);
  // Watch the register's sync badge. "Offline" on camera would teach the wrong thing, so a
  // take where it shows is thrown away rather than published -- unless the clip is about
  // going offline (meta.offlineOnPurpose).
  let offlineAt = null;
  const watch = setInterval(async () => {
    const txt = await page.evaluate(() => document.querySelector('[data-tour="sync-status"]')?.innerText?.trim() || "").catch(() => "");
    if (/offline|hors ligne|fuera de/i.test(txt) && offlineAt === null) {
      offlineAt = ctx.elapsed();
      log(`SYNC BADGE went "${txt}" at ${offlineAt.toFixed(1)}s`);
    }
  }, 400);
  let wall;
  if (dry) { ctx.t0 = Date.now(); await flow.run(ctx); wall = ctx.elapsed(); }
  else wall = await record(page, raw, () => flow.run(ctx), ctx);

  clearInterval(watch);
  if (offlineAt !== null && !flow.meta.offlineOnPurpose) throw new Error(`the register showed Offline at ${offlineAt.toFixed(1)}s — take discarded, re-run it`);
  const missing = clip.lines.map((l) => l.id).filter((id) => !(id in ctx.marks));
  if (missing.length) throw new Error(`flow never reached line(s): ${missing.join(", ")}`);
  if (!dry) {
    writeFileSync(raw.replace(/\.mp4$/, ".marks.json"), JSON.stringify({ wall, marks: ctx.marks }, null, 1));
    normalize(raw, wall);
  }
  log(`=== ${clipId} [${lang}] : OK (${wall.toFixed(1)}s) ===`);
  console.log(`${clipId} [${lang}]: ${wall.toFixed(1)}s`);
} catch (e) {
  log(`FAILED: ${e.message}`);
  console.error(`FAILED ${clipId} [${lang}]: ${e.message}`);
  // Bounded: a screenshot of a wedged page can hang, and so would the whole run.
  await Promise.race([
    page.screenshot({ path: join(here, "raw", `${clipId}.${lang}.failed.png`) }).catch(() => {}),
    new Promise((r) => setTimeout(r, 8000)),
  ]);
  process.exitCode = 1;
} finally {
  await Promise.race([browser.disconnect(), new Promise((r) => setTimeout(r, 5000))]);
  process.exit(process.exitCode ?? 0);
}

/** Puppeteer over-generates frames on a heavy page, so the file can run longer than what
 *  happened. The wall clock is the truth (the line marks are in it): rescale to match, at
 *  a constant 25 fps. */
function normalize(file, wall) {
  const count = () => Number(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0",
    "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", file], { encoding: "utf8" }).trim());
  const have = count() / 25;
  const factor = wall / have;
  const tmp = file.replace(/\.mp4$/, ".rt.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", file, "-filter:v", `setpts=${factor.toFixed(5)}*PTS`,
    "-r", "25", "-an", "-c:v", "libx264", "-crf", "16", "-preset", "veryfast", "-pix_fmt", "yuv420p", tmp]);
  renameSync(tmp, file);
  log(`normalized ${have.toFixed(1)}s -> ${(count() / 25).toFixed(1)}s (wall ${wall.toFixed(1)}s)`);
}
