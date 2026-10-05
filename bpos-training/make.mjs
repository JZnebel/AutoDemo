/**
 * Make clips end to end: narration, a fresh store, record, render, publish to the docs.
 *
 *   node bpos-training/make.mjs <clip-id ...|--all> [--lang en,fr] [--no-publish]
 *       [--jobs N]          record N takes at once, each in its own store and Chrome
 *       [--queue]           keep going from where the last --queue run stopped (.local/queue.json)
 *       [--fresh]           with --queue: forget the old queue and start over
 *       [--max-minutes M]   start nothing new after M minutes (for runs with a time limit);
 *                           run the same command again to carry on
 *       [--status]          print the queue and exit
 *
 * How a take goes: synthesise its narration, rebuild the store, record (up to 3 takes), then
 * render (finish.mjs). Rendering runs in the background while the next take records, one
 * render at a time. The store is rebuilt by one Rails process kept open for the whole run
 * (seed.mjs SeedDaemon) instead of starting Rails for every take.
 *
 * --jobs: worker 1 uses the usual store and Chrome; worker k uses store "<subdomain>k" and
 * Chrome on port <chromePort>+k-1. Takes of the same clip, or of clips sharing a
 * meta.resources entry (a login they create), never record at the same time.
 *
 * Every state change is one line on screen and in .local/queue.log.
 */
import { execFileSync, spawn } from "child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { CONFIG, browserArgs } from "./config.mjs";
import { SeedDaemon } from "./seed.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const valued = new Set(["--lang", "--jobs", "--max-minutes"]);
const langs = (opt("--lang") || "en,fr").split(",");
const jobs = Math.max(1, Number(opt("--jobs") || 1));
const useQueue = args.includes("--queue");
const deadline = opt("--max-minutes") ? Date.now() + Number(opt("--max-minutes")) * 60000 : Infinity;
const spec = JSON.parse(readFileSync(join(here, "narration.json"), "utf8"));

const local = join(here, ".local");
mkdirSync(local, { recursive: true });
const queuePath = join(local, "queue.json");
const logPath = join(local, "queue.log");

// ── Queue ────────────────────────────────────────────────────────────
const loadQueue = () => (existsSync(queuePath) ? JSON.parse(readFileSync(queuePath, "utf8")) : { items: [] });
const saveQueue = () => writeFileSync(queuePath, JSON.stringify(queue, null, 1));

if (args.includes("--status")) {
  const q = loadQueue();
  const by = (s) => q.items.filter((i) => i.status === s);
  for (const s of ["done", "failed", "pending", "recording", "rendering"]) {
    const list = by(s);
    if (list.length) console.log(`${s.padEnd(9)} ${String(list.length).padStart(3)}  ${list.slice(0, 12).map((i) => `${i.id}[${i.lang}]`).join(" ")}${list.length > 12 ? " …" : ""}`);
  }
  for (const i of by("failed")) console.log(`  ${i.id} [${i.lang}]: ${i.error}`);
  process.exit(0);
}

const ids = args.includes("--all") ? spec.clips.map((c) => c.id)
  : args.filter((a, i) => !a.startsWith("--") && !valued.has(args[i - 1]));
if (!ids.length && !useQueue) {
  console.error("usage: make.mjs <clip-id ...|--all> [--lang en,fr] [--jobs N] [--queue] [--max-minutes M] [--no-publish] [--status]");
  process.exit(1);
}
for (const id of ids) if (!spec.clips.some((c) => c.id === id)) throw new Error(`no clip ${id}`);

let queue = useQueue && !args.includes("--fresh") ? loadQueue() : { items: [] };
for (const it of queue.items) if (it.status === "recording" || it.status === "rendering") it.status = "pending";   // interrupted
for (const id of ids) for (const lang of langs) {
  const it = queue.items.find((i) => i.id === id && i.lang === lang);
  if (!it) queue.items.push({ id, lang, status: "pending", takes: 0 });
  else if (!useQueue || it.status === "failed") Object.assign(it, { status: "pending", takes: 0, error: undefined });
}
saveQueue();

const t0 = Date.now();
const stamp = () => {
  const s = Math.round((Date.now() - t0) / 1000);
  return `${String(Math.floor(s / 60)).padStart(3)}:${String(s % 60).padStart(2, "0")}`;
};
function status(it, state, detail = "") {
  if (state) it.status = state;
  it.at = new Date().toISOString();
  saveQueue();
  const counts = ["done", "failed"].map((s) => queue.items.filter((i) => i.status === s).length);
  const line = `[${stamp()}] ${`${it.id} [${it.lang}]`.padEnd(34)} ${state.padEnd(9)} ${detail}  (${counts[0]} done, ${counts[1]} failed, ${queue.items.length} total)`;
  console.log(line);
  appendFileSync(logPath, `${new Date().toISOString()} ${line}\n`);
}

// ── Helpers ──────────────────────────────────────────────────────────
/** Run a child to completion; its output goes to a per-take log, the tail is returned on failure. */
function runChild(cmd, cmdArgs, env, logFile) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, cmdArgs, { cwd: join(here, ".."), env: { ...process.env, ...env } });
    let tail = "";
    const keep = (d) => { appendFileSync(logFile, d); tail = (tail + d).slice(-600); };
    p.stdout.on("data", keep);
    p.stderr.on("data", keep);
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(tail.trim().split("\n").filter(Boolean).pop() || `exit ${code}`))));
  });
}

async function ensureChrome(port) {
  const up = () => fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.ok, () => false);
  if (await up()) return;
  spawn("google-chrome", browserArgs(port), { detached: true, stdio: "ignore" }).unref();
  for (let i = 0; i < 30 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500));
  if (!(await up())) throw new Error(`Chrome didn't start on port ${port}`);
}

/** The dev server can be restarted under us (other work shares it): wait for it. */
async function serverUp(base) {
  for (let i = 0; i < 60; i++) {
    if (await fetch(`${base}/up`).then((r) => r.ok, () => false)) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`${base} isn't answering`);
}

// One render at a time, behind the recordings.
let renderChain = Promise.resolve();
const renders = [];
function render(it, logFile) {
  const job = renderChain.then(async () => {
    status(it, "rendering");
    try {
      await runChild("node", [join(here, "finish.mjs"), it.id, it.lang], {}, logFile);
      status(it, "done");
    } catch (e) {
      it.error = `finish: ${e.message} — see out/review/${it.id}.${it.lang}/quality.json`;
      status(it, "failed", it.error);
    }
  });
  renderChain = job;
  renders.push(job);
}

// ── Workers ──────────────────────────────────────────────────────────
const seeder = new SeedDaemon();
const busy = new Set();   // resource keys held by takes being recorded
// Loaded up front so claim() has no awaits in it: two workers can't take the same item.
const flows = new Map();
for (const id of new Set(queue.items.map((i) => i.id))) {
  flows.set(id, await import(join(here, spec.clips.find((c) => c.id === id).flow)));
}
const flowOf = (id) => flows.get(id);
const keysOf = (it, flow) => [`clip:${it.id}`, ...(flow.meta.resources || [])];

/** Take the next item no other worker conflicts with. */
function claim() {
  for (const it of queue.items) {
    if (it.status !== "pending") continue;
    const keys = keysOf(it, flowOf(it.id));
    if (keys.some((k) => busy.has(k))) continue;
    keys.forEach((k) => busy.add(k));
    it.status = "recording";
    return { it, keys };
  }
  return null;
}

async function worker(k) {
  const subdomain = k === 1 ? CONFIG.subdomain : `${CONFIG.subdomain}${k}`;
  const port = CONFIG.chromePort + k - 1;
  const localBase = k === 1 ? CONFIG.localBase : CONFIG.localBase.replace(`//${CONFIG.subdomain}.`, `//${subdomain}.`);
  const env = { BT_SUBDOMAIN: subdomain, BT_CHROME_PORT: String(port), BT_LOCAL_BASE: localBase, BT_FILM_HOST: `${subdomain}.brotherpos.ca` };
  await ensureChrome(port);
  for (;;) {
    if (Date.now() > deadline) return;
    const got = claim();
    if (!got) {
      // Nothing free: done if nothing is pending, else wait for a conflicting take to finish.
      if (!queue.items.some((i) => i.status === "pending")) return;
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    const { it, keys } = got;
    const flow = flowOf(it.id);
    const logFile = join(local, "logs", `${it.id}.${it.lang}.log`);
    mkdirSync(dirname(logFile), { recursive: true });
    writeFileSync(logFile, "");
    let ok = false;
    try {
      status(it, "recording", `worker ${k}: narration`);
      await runChild("python3", [join(here, "tts.py"), it.id, it.lang], env, logFile);
      for (let take = 1; take <= 3 && !ok; take++) {
        it.takes = (it.takes || 0) + 1;
        try {
          await serverUp(localBase);
          appendFileSync(logFile, await seeder.seed([...(flow.meta.seed || []), `--lang=${it.lang}`], subdomain));
          status(it, "recording", `worker ${k}: take ${take}`);
          await runChild("node", [join(here, "run-flow.mjs"), it.id, it.lang], { ...env, REC_LOG: logFile }, logFile);
          ok = true;
        } catch (e) {
          it.error = e.message;
          status(it, "recording", `take ${take} failed: ${e.message.slice(0, 120)}`);
        }
      }
    } catch (e) {
      it.error = e.message;
    } finally {
      keys.forEach((key) => busy.delete(key));
    }
    if (ok) render(it, logFile);
    else status(it, "failed", it.takes ? `${it.takes >= 3 ? "three takes" : "the take"} failed — see .local/logs/${it.id}.${it.lang}.log and raw/${it.id}.${it.lang}.failed.png` : it.error);
  }
}

try {
  await Promise.all(Array.from({ length: jobs }, (_, i) => worker(i + 1)));
  await Promise.all(renders);
} finally {
  seeder.stop();
}

const mine = queue.items.filter((i) => !ids.length || ids.includes(i.id));
const done = [...new Set(mine.filter((i) => i.status === "done").map((i) => i.id))];
const failed = mine.filter((i) => i.status === "failed");
const left = queue.items.filter((i) => i.status === "pending");
if (done.length && !args.includes("--no-publish")) execFileSync("node", [join(here, "publish.mjs"), ...done], { cwd: join(here, ".."), stdio: "inherit" });
console.log(`\n${done.length} clip(s) made in ${stamp().trim()}.`);
if (failed.length) {
  console.log(`NOT MADE: ${failed.map((i) => `${i.id} [${i.lang}]`).join(", ")}`);
  process.exitCode = 1;
}
if (left.length) console.log(`${left.length} left (time limit) — run the same command again to carry on.`);
