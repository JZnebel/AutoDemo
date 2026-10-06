/**
 * A project is one app's folder of walkthrough clips:
 *
 *   <project>/
 *     autodemo.config.mjs   how to drive this app (below)
 *     narration.json        the clips: { voices, clips: [{ id, flow | shots, frame, title, lines }] }
 *                           (frame "phone": a portrait recording shown in a handset)
 *     flows/*.mjs           one per clip (or per shot): meta, setup(ctx, { lang }), run(ctx)
 *     raw/ audio/ out/ props/ .local/   made by the pipeline (gitignore them)
 *
 * autodemo.config.mjs default-exports an object. Only `languages` is required; everything
 * else switches a feature on:
 *
 *   languages: ["en", "fr"]          the narration keys in each line
 *   accentColor: "rgba(16,185,129,1)"
 *   render: { captions: "band" | "overlay", band: 120, background: "#0f1720" }
 *   chrome: { port: 9334, args(port) { return [...] } }    the filming browser
 *   reset({ flags, lang, worker }) → string                 put the app in a known state
 *                                                           before a take (flags: flow.meta.seed)
 *   ready(worker)                                           wait until the app answers
 *   beforeAll() / afterAll()                                once per make run (cleanup)
 *   workers(k) → { env, marker }                            what worker k (2, 3...) of
 *                                                           --jobs changes, and the text that
 *                                                           gives it away on screen
 *   labels() → [[english, [other languages...]], ...]       the app's own UI strings, for
 *                                                           the untranslated-text check
 *   allowedText(worker) → string[]                          text that is fine on screen in any
 *                                                           language (store data, names)
 *   guards: [{ name, check(page) → string|null, unless: "metaKey" }]
 *                                                           watched during a take; text from
 *                                                           check() discards it
 *   docs: { videos, root, deploy: { host, dir, url } }      help site to publish to (ship.mjs)
 *   shutdown()                                              end of a make run
 *
 * The CLI (core/cli.mjs) finds the project from its first argument — a path, or a name under
 * examples/ — and hands it to the scripts in AUTODEMO_PROJECT.
 */
import { existsSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function projectDir(arg = process.env.AUTODEMO_PROJECT) {
  if (!arg) throw new Error("no project: pass one (a folder, or a name under examples/) or set AUTODEMO_PROJECT");
  for (const d of [resolve(arg), join(ROOT, "examples", arg)]) {
    if (existsSync(join(d, "autodemo.config.mjs"))) return d;
  }
  throw new Error(`no autodemo.config.mjs in "${arg}" or examples/${arg}`);
}

export async function loadProject(arg) {
  const dir = projectDir(arg);
  const config = (await import(pathToFileURL(join(dir, "autodemo.config.mjs")).href)).default;
  const spec = JSON.parse(readFileSync(join(dir, "narration.json"), "utf8"));
  const clip = (id) => {
    const c = spec.clips.find((x) => x.id === id);
    if (!c) throw new Error(`no clip "${id}" in ${dir}/narration.json`);
    return c;
  };
  /** A clip is one flow, or several shots played in order (each its own flow and size). */
  const shots = (c) => (c.shots || [{ flow: c.flow, frame: c.frame }]).map((s) => ({ ...s, frame: s.frame || "none", flowPath: join(dir, s.flow) }));
  const p = (...a) => join(dir, ...a);
  return {
    dir, config, spec, clip, shots,
    root: ROOT,
    raw: (id, lang, i = null) => p("raw", `${id}.${lang}${i ? `.${i}` : ""}.mp4`),
    audio: (id, lang) => p("audio", id, lang),
    out: (...a) => p("out", ...a),
    local: (...a) => p(".local", ...a),
    path: p,
  };
}

/**
 * A recorded take as finish/checks see it: its shots, each with the recording and what the
 * recorder logged. Takes recorded before shots existed (one raw/<clip>.<lang>.mp4 with flat
 * marks) read as one shot.
 */
export function loadTake(project, clipId, lang) {
  const raw = project.raw(clipId, lang);
  const marksPath = raw.replace(/\.mp4$/, ".marks.json");
  const screenPath = raw.replace(/\.mp4$/, ".screen.json");
  const marks = JSON.parse(readFileSync(marksPath, "utf8"));
  const screen = existsSync(screenPath) ? JSON.parse(readFileSync(screenPath, "utf8")) : {};
  const shotDefs = project.shots(project.clip(clipId));
  const shots = (marks.shots || [{ wall: marks.wall, marks: marks.marks }]).map((m, i) => ({
    ...shotDefs[i],
    video: shotDefs.length > 1 ? project.raw(clipId, lang, i + 1) : raw,
    wall: m.wall,
    marks: m.marks,
    ...((screen.shots || [screen])[i] || {}),
  }));
  return { shots, worker: screen.worker || { k: 1, marker: screen.subdomain || null } };
}
