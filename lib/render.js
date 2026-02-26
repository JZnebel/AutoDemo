import { execSync } from "child_process";
import { writeFileSync } from "fs";

/**
 * Merge a video and audio track into a single MP4.
 *
 * @param {string} videoPath - Path to input video (webm or mp4)
 * @param {string} audioPath - Path to input audio (mp3)
 * @param {string} outputPath - Path for the output MP4
 * @param {object} [opts]
 * @param {number} [opts.volume=1.5] - Audio volume multiplier
 * @param {number} [opts.crf=20] - Video quality (lower = better, 18-28 typical)
 * @param {string} [opts.preset="fast"] - x264 encoding speed preset
 */
export function mergeVideoAudio(videoPath, audioPath, outputPath, opts = {}) {
  const volume = opts.volume ?? 1.5;
  const crf = opts.crf ?? 20;
  const preset = opts.preset ?? "fast";

  execSync(
    `ffmpeg -y -i "${videoPath}" -i "${audioPath}" -af "volume=${volume},aformat=channel_layouts=stereo" -c:v libx264 -preset ${preset} -crf ${crf} -c:a aac -b:a 192k -map 0:v -map 1:a -shortest "${outputPath}" 2>/dev/null`
  );
}

/**
 * Burn SRT subtitles into a video.
 *
 * @param {string} inputPath - Input video path
 * @param {string} srtPath - SRT subtitle file path
 * @param {string} outputPath - Output video path
 * @param {object} [opts]
 * @param {string} [opts.fontName="Arial"] - Subtitle font
 * @param {number} [opts.fontSize=24] - Subtitle font size
 */
export function burnCaptions(inputPath, srtPath, outputPath, opts = {}) {
  const fontName = opts.fontName ?? "Arial";
  const fontSize = opts.fontSize ?? 24;

  execSync(
    `ffmpeg -y -i "${inputPath}" -vf "subtitles=${srtPath}:force_style='FontName=${fontName},FontSize=${fontSize},PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=2,Shadow=1'" -c:v libx264 -preset fast -crf 20 -c:a copy "${outputPath}" 2>/dev/null`
  );
}

/**
 * Concatenate multiple video files into one using ffmpeg concat demuxer.
 *
 * @param {string[]} scenePaths - Array of video file paths in order
 * @param {string} outputPath - Output video path
 */
export function stitchScenes(scenePaths, outputPath) {
  const listContent = scenePaths.map((p) => `file '${p}'`).join("\n");
  const listPath = outputPath.replace(/\.[^.]+$/, "") + "_concat.txt";
  writeFileSync(listPath, listContent);

  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${outputPath}" 2>/dev/null`
  );
}

/**
 * Convert a webm recording to MP4 (no audio).
 *
 * @param {string} inputPath - Input webm path
 * @param {string} outputPath - Output mp4 path
 * @param {object} [opts]
 * @param {number} [opts.crf=20] - Video quality
 */
export function convertToMp4(inputPath, outputPath, opts = {}) {
  const crf = opts.crf ?? 20;
  execSync(
    `ffmpeg -y -i "${inputPath}" -c:v libx264 -preset fast -crf ${crf} "${outputPath}" 2>/dev/null`
  );
}
