/**
 * SadTalker avatar provider — generates talking head video from image + audio.
 *
 * Requires: SadTalker cloned at ../SadTalker/ with venv and checkpoints.
 * GPU: CUDA-capable GPU strongly recommended (CPU works but is very slow).
 */

import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { join, resolve, dirname, basename } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SADTALKER_DIR = resolve(__dirname, "../../SadTalker");
const PYTHON = join(SADTALKER_DIR, "venv/bin/python");
const CHECKPOINT_DIR = join(SADTALKER_DIR, "checkpoints");

export const name = "sadtalker";
export const description = "SadTalker (local, CUDA) — audio-driven talking head from a single image";

/**
 * Check if SadTalker is installed and ready.
 */
export function isAvailable() {
  return (
    existsSync(PYTHON) &&
    existsSync(CHECKPOINT_DIR) &&
    existsSync(join(SADTALKER_DIR, "inference.py"))
  );
}

/**
 * Generate a talking head video.
 *
 * @param {Object} options
 * @param {string} options.image       - Path to source face image (PNG/JPG)
 * @param {string} options.audio       - Path to narration audio (WAV/MP3)
 * @param {string} [options.outputDir] - Output directory (default: temp)
 * @param {number} [options.poseStyle] - Pose animation style 0-46 (default: 0)
 * @param {number} [options.size]      - Face model resolution 256 or 512 (default: 512)
 * @param {string} [options.preprocess] - crop|resize|full|extcrop|extfull (default: crop)
 * @param {boolean} [options.still]    - Minimal head motion (default: false)
 * @param {boolean} [options.enhancer] - Use GFPGAN face enhancer (default: false)
 * @param {boolean} [options.verbose]  - Print SadTalker output (default: false)
 * @returns {{ videoPath: string, duration: number }}
 */
export function generate(options) {
  if (!isAvailable()) {
    throw new Error(
      `SadTalker not found at ${SADTALKER_DIR}. ` +
      `Expected venv at ${PYTHON} and checkpoints at ${CHECKPOINT_DIR}.`
    );
  }

  const {
    image,
    audio,
    outputDir = join(SADTALKER_DIR, "results"),
    poseStyle = 0,
    size = 512,
    preprocess = "crop",
    still = false,
    enhancer = false,
    verbose = false,
  } = options;

  if (!image || !existsSync(image)) {
    throw new Error(`Source image not found: ${image}`);
  }
  if (!audio || !existsSync(audio)) {
    throw new Error(`Audio file not found: ${audio}`);
  }

  mkdirSync(outputDir, { recursive: true });

  const args = [
    join(SADTALKER_DIR, "inference.py"),
    "--driven_audio", resolve(audio),
    "--source_image", resolve(image),
    "--result_dir", resolve(outputDir),
    "--pose_style", String(poseStyle),
    "--size", String(size),
    "--preprocess", preprocess,
    "--checkpoint_dir", CHECKPOINT_DIR,
  ];

  if (still) args.push("--still");
  if (enhancer) args.push("--enhancer", "gfpgan");

  console.log(`  [sadtalker] Generating avatar from ${basename(image)} + ${basename(audio)}...`);
  const startTime = Date.now();

  try {
    execFileSync(PYTHON, args, {
      cwd: SADTALKER_DIR,
      stdio: verbose ? "inherit" : "pipe",
      timeout: 600000, // 10 min max
      env: {
        ...process.env,
        PYTHONPATH: SADTALKER_DIR,
      },
    });
  } catch (err) {
    const stderr = err.stderr?.toString() || "";
    throw new Error(`SadTalker inference failed: ${stderr.slice(-500)}`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // SadTalker outputs to a timestamped subdirectory — find the newest .mp4
  const videoPath = findNewestMp4(outputDir);
  if (!videoPath) {
    throw new Error(`SadTalker produced no output video in ${outputDir}`);
  }

  // Get duration via ffprobe
  let duration = 0;
  try {
    const probe = execFileSync("ffprobe", [
      "-v", "quiet",
      "-show_entries", "format=duration",
      "-of", "csv=p=0",
      videoPath,
    ]).toString().trim();
    duration = parseFloat(probe) || 0;
  } catch {
    // ffprobe not available or failed — duration unknown
  }

  console.log(`  [sadtalker] Done in ${elapsed}s → ${videoPath} (${duration.toFixed(1)}s)`);

  return { videoPath, duration };
}

/**
 * Find the newest .mp4 file recursively under a directory.
 */
function findNewestMp4(dir) {
  let newest = null;
  let newestTime = 0;

  function walk(d) {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (entry.endsWith(".mp4") && stat.mtimeMs > newestTime) {
        newest = full;
        newestTime = stat.mtimeMs;
      }
    }
  }

  walk(dir);
  return newest;
}
