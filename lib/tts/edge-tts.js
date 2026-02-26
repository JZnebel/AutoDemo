import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";

/**
 * Microsoft Edge TTS provider.
 * Free, no API key required, 100+ voices, decent quality.
 * Uses the edge-tts Python package (pip install edge-tts).
 *
 * Good for: draft renders, iteration, testing.
 * Limitations: no character-level timestamps (use Whisper for captions).
 */

const DEFAULT_VOICE = "en-US-ChristopherNeural"; // Male, natural
const VOICES = {
  // Male
  "chris": "en-US-ChristopherNeural",
  "guy": "en-US-GuyNeural",
  "eric": "en-US-EricNeural",
  "roger": "en-US-RogerNeural",
  // Female
  "jenny": "en-US-JennyNeural",
  "aria": "en-US-AriaNeural",
  "sara": "en-US-SaraNeural",
  // British
  "ryan": "en-GB-RyanNeural",
  "sonia": "en-GB-SoniaNeural",
  // Canadian
  "liam": "en-CA-LiamNeural",
  "clara": "en-CA-ClaraNeural",
};

function ensureEdgeTts() {
  try {
    execSync("edge-tts --version", { stdio: "pipe" });
  } catch {
    console.log("  Installing edge-tts...");
    execSync("pip install edge-tts", { stdio: "pipe" });
  }
}

export const edgeTts = {
  name: "edge-tts",
  requiresApiKey: false,

  /** List available voice shortcuts */
  voices: VOICES,

  /**
   * @param {string} text - Full narration text
   * @param {object} [options]
   * @param {string} [options.voice] - Voice name or shortcut (default: "chris")
   * @param {string} [options.outputPath] - Write MP3 to this path
   * @param {string} [options.rate] - Speed adjustment (e.g., "+10%", "-20%")
   * @param {string} [options.pitch] - Pitch adjustment (e.g., "+5Hz", "-10Hz")
   * @returns {Promise<{audioBuffer: Buffer, audioPath: string, duration: number, segments: null, wordTimings: null, raw: object}>}
   */
  async generate(text, options = {}) {
    ensureEdgeTts();

    const voiceName = VOICES[options.voice] || options.voice || DEFAULT_VOICE;
    const outputPath = options.outputPath || join(tmpdir(), `edge-tts-${Date.now()}.mp3`);
    const subsPath = outputPath.replace(/\.mp3$/, ".vtt");

    const args = [
      `--voice "${voiceName}"`,
      `--text "${text.replace(/"/g, '\\"')}"`,
      `--write-media "${outputPath}"`,
      `--write-subtitles "${subsPath}"`,
    ];

    if (options.rate) args.push(`--rate="${options.rate}"`);
    if (options.pitch) args.push(`--pitch="${options.pitch}"`);

    execSync(`edge-tts ${args.join(" ")}`, { stdio: "pipe", timeout: 120000 });

    const audioBuffer = readFileSync(outputPath);

    // Get duration via ffprobe
    let duration = 0;
    try {
      const probe = execSync(
        `ffprobe -v quiet -print_format json -show_format "${outputPath}"`,
        { encoding: "utf8" }
      );
      duration = parseFloat(JSON.parse(probe).format.duration) || 0;
    } catch {
      // Estimate from file size (~16KB/sec for 128kbps MP3)
      duration = audioBuffer.length / 16000;
    }

    // Parse VTT subtitles for basic segment timing (not word-level)
    let vttSegments = null;
    if (existsSync(subsPath)) {
      vttSegments = parseVtt(readFileSync(subsPath, "utf8"));
    }

    return {
      audioBuffer,
      audioPath: outputPath,
      duration,
      durationMs: Math.round(duration * 1000),
      segments: vttSegments,
      wordTimings: null, // Edge TTS doesn't provide word-level — use Whisper
      raw: { voice: voiceName, subsPath },
    };
  },
};

/**
 * Parse WebVTT subtitle file into segment array.
 */
function parseVtt(vttContent) {
  const segments = [];
  const lines = vttContent.split("\n");
  let i = 0;

  while (i < lines.length) {
    // Look for timestamp lines: "00:00:00.000 --> 00:00:02.500"
    const match = lines[i]?.match(
      /(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/
    );
    if (match) {
      const startSec = parseTimestamp(match[1]);
      const endSec = parseTimestamp(match[2]);
      i++;
      const textLines = [];
      while (i < lines.length && lines[i].trim() !== "") {
        textLines.push(lines[i].trim());
        i++;
      }
      const text = textLines.join(" ");
      if (text) {
        segments.push({ text, startSec, endSec, durationSec: endSec - startSec });
      }
    }
    i++;
  }

  return segments;
}

function parseTimestamp(ts) {
  const [h, m, rest] = ts.split(":");
  const [s, ms] = rest.split(".");
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
}
