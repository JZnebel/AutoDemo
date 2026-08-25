/**
 * Put a recording back on real time.
 *
 * Puppeteer fills gaps between screencast frames using CDP timestamps, and on a
 * heavy page it over-generates: the owner loyalty clip came out 42.8s long for
 * 36.7s of actual interaction, which plays ~17% slow. record() logs the wall
 * clock, which is the ground truth; this rescales the container to match.
 *
 * usage: node rezweed-start/normalize.mjs <file.mp4> <wallSeconds>
 */
import { execFileSync } from "child_process";
import { renameSync } from "fs";

const [file, wallArg] = process.argv.slice(2);
if (!file || !wallArg) { console.error("usage: normalize.mjs <file.mp4> <wallSeconds>"); process.exit(1); }
const wall = Number(wallArg);

const frames = Number(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0",
  "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", file], { encoding: "utf8" }).trim());
const have = frames / 25;
const factor = wall / have;

if (Math.abs(factor - 1) < 0.02) {
  console.log(`${file}: ${have.toFixed(1)}s vs ${wall}s wall — within 2%, left alone`);
  process.exit(0);
}
const tmp = file.replace(/\.mp4$/, ".rt.mp4");
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", file, "-filter:v", `setpts=${factor.toFixed(5)}*PTS`,
  "-r", "25", "-an", tmp]);
renameSync(tmp, file);
const after = Number(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0",
  "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", file], { encoding: "utf8" }).trim()) / 25;
console.log(`${file}: ${have.toFixed(1)}s -> ${after.toFixed(1)}s (wall ${wall}s, factor ${factor.toFixed(3)})`);
