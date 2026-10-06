/**
 * Record one clip in one language.
 *
 *   node core/cli.mjs record <project> <clip-id> <lang> [--dry]
 *
 * Needs the narration synthesised first (tts.py) — the recording is paced to it. Writes
 * raw/<clip>.<lang>.mp4 (put back on real time), .marks.json (where each line starts) and
 * .screen.json (what the recorder saw: for checks.mjs and the edit in finish.mjs). A clip
 * with several shots writes raw/<clip>.<lang>.<n>.mp4 per shot and one marks/screen file
 * with a `shots` array. --dry rehearses without recording (it still changes the app).
 */
import { execFileSync } from "child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { connect, makeCtx, record, log } from "./recorder.mjs";
import { loadProject } from "./project.mjs";

const project = await loadProject();
const { config } = project;
const [clipId, lang] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const dry = process.argv.includes("--dry");
if (!clipId || !lang) { console.error("usage: record <project> <clip-id> <lang> [--dry]"); process.exit(1); }

const clip = project.clip(clipId);
const durations = JSON.parse(readFileSync(join(project.audio(clipId, lang), "durations.json"), "utf8"));
const shots = project.shots(clip);
const flows = await Promise.all(shots.map((s) => import(s.flowPath)));
const worker = { k: Number(process.env.AUTODEMO_WORKER || 1), marker: process.env.AUTODEMO_WORKER_MARKER || null };

const first = flows[0].meta.viewport ?? {};
const { browser, page } = await connect({ ...first, port: Number(process.env.AUTODEMO_CHROME_PORT || config.chrome?.port || 9334) });
// Close any tab a previous take left open: Chrome sends no screencast frames for a
// background tab, and the recording would wait for them forever.
for (const p of await browser.pages()) if (p !== page) await p.close().catch(() => {});
await page.bringToFront();
page.on("pageerror", (e) => log("PAGE EXC: " + String(e).slice(0, 160)));
page.on("requestfailed", (r) => log(`REQ FAILED ${r.failure()?.errorText} ${r.method()} ${r.url().slice(0, 140)}`));
page.on("response", (r) => { if (r.status() >= 500) log(`HTTP ${r.status()} ${r.request().method()} ${r.url().slice(0, 140)}`); });
// A native confirm()/alert() blocks the renderer and every CDP call with it. They're painted
// by the browser, not the page, so they never appear in a recording anyway: accept them.
page.on("dialog", async (d) => {
  log(`dialog (${d.type()}) auto-accepted: ${d.message().slice(0, 60)}`);
  await d.accept().catch(() => {});
});

const raw = project.raw(clipId, lang);
mkdirSync(dirname(raw), { recursive: true });
const takeMarks = [];
const takeScreens = [];
const marked = {};
try {
  for (let i = 0; i < shots.length; i++) {
    const flow = flows[i];
    if (i > 0 && flow.meta.viewport) await page.setViewport(flow.meta.viewport);
    // Each shot starts with a fresh pacing clock: a shot's flow ends with ctx.finishSpeaking(),
    // so the next shot's first line never talks over the last one.
    const ctx = makeCtx(page, { durations });
    const name = shots.length > 1 ? `${clipId} [${lang}] shot ${i + 1}` : `${clipId} [${lang}]`;
    log(`=== ${name} : setup ===`);
    await flow.setup(ctx, { lang });
    log(`=== ${name} : ${dry ? "run (dry)" : "record"} ===`);

    // Guards: things that must never be on camera (an "Offline" badge, an error page).
    const problems = [];
    const watch = setInterval(async () => {
      for (const g of config.guards || []) {
        if (g.unless && flow.meta[g.unless]) continue;
        const bad = await g.check(page).catch(() => null);
        if (bad && !problems.some((p) => p.name === g.name)) {
          problems.push({ name: g.name, at: ctx.elapsed(), bad });
          log(`GUARD ${g.name}: "${bad}" at ${ctx.elapsed().toFixed(1)}s`);
        }
      }
    }, 400);

    const file = shots.length > 1 ? project.raw(clipId, lang, i + 1) : raw;
    let wall;
    try {
      if (dry) { ctx.t0 = Date.now(); await flow.run(ctx, { lang }); wall = ctx.elapsed(); }
      else wall = await record(page, file, () => flow.run(ctx, { lang }), ctx);
    } finally {
      clearInterval(watch);
    }
    if (problems.length) {
      const p = problems[0];
      throw new Error(`${p.name}: "${p.bad}" was on screen at ${p.at.toFixed(1)}s — take discarded`);
    }
    Object.assign(marked, ctx.marks);
    takeMarks.push({ wall, marks: ctx.marks });
    takeScreens.push({ actions: ctx.actions, busy: ctx.busy, issues: ctx.issues, snapshots: ctx.snapshots });
    if (!dry) normalize(file, wall);
    log(`=== ${name} : OK (${wall.toFixed(1)}s) ===`);
  }

  const missing = clip.lines.map((l) => l.id).filter((id) => !(id in marked));
  if (missing.length) throw new Error(`flow never reached line(s): ${missing.join(", ")}`);
  if (!dry) {
    const one = takeMarks.length === 1;
    writeFileSync(raw.replace(/\.mp4$/, ".marks.json"), JSON.stringify(one ? takeMarks[0] : { shots: takeMarks }, null, 1));
    writeFileSync(raw.replace(/\.mp4$/, ".screen.json"), JSON.stringify(one ? { worker, ...takeScreens[0] } : { worker, shots: takeScreens }));
  }
  const total = takeMarks.reduce((t, m) => t + m.wall, 0);
  console.log(`${clipId} [${lang}]: ${total.toFixed(1)}s`);
} catch (e) {
  log(`FAILED: ${e.message}`);
  console.error(`FAILED ${clipId} [${lang}]: ${e.message}`);
  // Bounded: a screenshot of a wedged page can hang, and so would the whole run.
  await Promise.race([
    page.screenshot({ path: raw.replace(/\.mp4$/, ".failed.png") }).catch(() => {}),
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
