import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

/**
 * Kokoro TTS provider.
 * Open-weight, runs locally, no API key, no network.
 * Best quality among free local options.
 *
 * Install: pip install kokoro-onnx
 * Models auto-download on first use.
 *
 * Good for: offline mode, maximum privacy, zero cost.
 * Limitations: English only, no word-level timestamps.
 */

const DEFAULT_VOICE = "af_heart"; // American female, natural
const VOICES = {
  // American Female
  "heart": "af_heart",
  "bella": "af_bella",
  "nicole": "af_nicole",
  "sarah": "af_sarah",
  "sky": "af_sky",
  // American Male
  "adam": "am_adam",
  "michael": "am_michael",
  // British Female
  "emma": "bf_emma",
  "isabella": "bf_isabella",
  // British Male
  "george": "bm_george",
  "lewis": "bm_lewis",
};

function ensureKokoro() {
  try {
    execSync("python3 -c 'import kokoro_onnx'", { stdio: "pipe" });
  } catch {
    console.log("  Installing kokoro-onnx...");
    execSync("pip install kokoro-onnx", { stdio: "pipe", timeout: 120000 });
  }
}

export const kokoro = {
  name: "kokoro",
  requiresApiKey: false,

  voices: VOICES,

  /**
   * @param {string} text - Full narration text
   * @param {object} [options]
   * @param {string} [options.voice] - Voice name or shortcut (default: "heart")
   * @param {string} [options.outputPath] - Write WAV to this path
   * @param {number} [options.speed=1.0] - Speech speed multiplier
   * @returns {Promise<{audioBuffer: Buffer, audioPath: string, duration: number, segments: null, wordTimings: null, raw: object}>}
   */
  async generate(text, options = {}) {
    ensureKokoro();

    const voiceName = VOICES[options.voice] || options.voice || DEFAULT_VOICE;
    const speed = options.speed || 1.0;
    const wavPath = (options.outputPath || join(tmpdir(), `kokoro-${Date.now()}.wav`))
      .replace(/\.mp3$/, ".wav");
    const mp3Path = options.outputPath || wavPath.replace(/\.wav$/, ".mp3");

    // Generate WAV via Python one-liner
    const pyScript = `
import kokoro_onnx
import soundfile as sf
kokoro = kokoro_onnx.Kokoro("kokoro-v1.0.onnx", "${voiceName}")
samples, sr = kokoro.create("${text.replace(/"/g, '\\"').replace(/\n/g, ' ')}", speed=${speed})
sf.write("${wavPath}", samples, sr)
print(len(samples) / sr)
`.trim();

    const result = execSync(`python3 -c '${pyScript}'`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 120000,
    });

    const duration = parseFloat(result.trim()) || 0;

    // Convert to MP3 for consistency
    if (mp3Path !== wavPath) {
      execSync(`ffmpeg -y -i "${wavPath}" -codec:a libmp3lame -b:a 128k "${mp3Path}"`, {
        stdio: "pipe",
      });
    }

    const audioBuffer = readFileSync(mp3Path);

    return {
      audioBuffer,
      audioPath: mp3Path,
      duration,
      durationMs: Math.round(duration * 1000),
      segments: null,
      wordTimings: null, // No timestamps — use Whisper
      raw: { voice: voiceName, speed, wavPath },
    };
  },
};
