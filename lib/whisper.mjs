#!/usr/bin/env node
/**
 * Whisper.cpp transcription via @remotion/install-whisper-cpp
 *
 * Replaces the manual Python venv whisper setup. Uses Remotion's built-in
 * integration with DTW flag for phoneme-level timing accuracy.
 *
 * Usage:
 *   import { transcribeAudio } from './lib/whisper.mjs';
 *   const { captions, wordTimings } = await transcribeAudio('/path/to/audio.wav');
 */
import path from "path";
import { execSync } from "child_process";
import { existsSync } from "fs";
import {
  installWhisperCpp,
  downloadWhisperModel,
  transcribe,
  toCaptions,
} from "@remotion/install-whisper-cpp";

const WHISPER_DIR = path.join(process.cwd(), "whisper.cpp");
const WHISPER_VERSION = "1.7.3";
const DEFAULT_MODEL = "large-v3-turbo";

/**
 * Ensure whisper.cpp is installed and model is downloaded.
 * Idempotent — skips if already present.
 */
export async function ensureWhisper(model = DEFAULT_MODEL) {
  if (!existsSync(path.join(WHISPER_DIR, "main"))) {
    console.log("  Installing whisper.cpp...");
    await installWhisperCpp({ to: WHISPER_DIR, version: WHISPER_VERSION });
  }

  const modelPath = path.join(WHISPER_DIR, "models", `ggml-${model}.bin`);
  if (!existsSync(modelPath)) {
    console.log(`  Downloading model: ${model}...`);
    await downloadWhisperModel({ model, folder: WHISPER_DIR });
  }
}

/**
 * Convert audio to 16KHz WAV (required by whisper.cpp).
 * @param {string} inputPath - Path to any audio/video file
 * @returns {string} Path to the converted WAV file
 */
export function convertTo16kWav(inputPath) {
  const wavPath = inputPath.replace(/\.[^.]+$/, ".16k.wav");
  execSync(
    `ffmpeg -y -i "${inputPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${wavPath}"`,
    { stdio: "pipe" }
  );
  return wavPath;
}

/**
 * Transcribe audio and return word-level timings.
 *
 * @param {string} inputPath - Path to audio file (any format — auto-converts to 16k WAV)
 * @param {object} [options]
 * @param {string} [options.model="medium.en"] - Whisper model
 * @param {boolean} [options.printOutput=false] - Print whisper progress
 * @returns {Promise<{captions: Array<{text: string, startMs: number, endMs: number, confidence: number}>, wordTimings: Array<{text: string, startMs: number, endMs: number}>}>}
 */
export async function transcribeAudio(inputPath, options = {}) {
  const model = options.model || DEFAULT_MODEL;
  await ensureWhisper(model);

  // Convert to 16KHz WAV if needed
  let wavPath = inputPath;
  if (!inputPath.endsWith(".wav") || !inputPath.includes("16k")) {
    console.log("  Converting to 16KHz WAV...");
    wavPath = convertTo16kWav(inputPath);
  }

  console.log(`  Running whisper.cpp (model: ${model})...`);
  const whisperCppOutput = await transcribe({
    inputPath: wavPath,
    whisperPath: WHISPER_DIR,
    whisperCppVersion: WHISPER_VERSION,
    model,
    tokenLevelTimestamps: true,
    printOutput: options.printOutput ?? false,
  });

  const { captions } = toCaptions({ whisperCppOutput });

  // Build word timings from raw tokens using BPE space-prefix rule.
  // In whisper's BPE tokenizer, tokens starting with a space mark a new word.
  // Tokens without a leading space are continuations of the previous word.
  // e.g. [" P", "OS"] → "POS", [" We", "'ll"] → "We'll",
  //      [" Cler", "ks"] → "Clerks", [" Loy", "al", "ty"] → "Loyalty"
  const wordTimings = buildWordTimingsFromTokens(whisperCppOutput);

  return { captions, wordTimings };
}

/**
 * Build word-level timings from raw whisper.cpp token data using BPE space-prefix.
 *
 * In whisper's BPE tokenizer, a token starting with a space marks a new word.
 * Tokens without a leading space are continuations of the previous word:
 *   [" P", "OS"] → "POS"
 *   [" We", "'ll"] → "We'll"
 *   [" Cler", "ks"] → "Clerks"
 *   [" Loy", "al", "ty"] → "Loyalty"
 *   [" Weight", "-", "based"] → "Weight-based"
 *
 * Uses t_dtw (DTW timestamps) when available for sub-frame accuracy,
 * falling back to offsets.from/to.
 */
function buildWordTimingsFromTokens(whisperCppOutput) {
  const words = [];
  let current = null;

  for (const segment of whisperCppOutput.transcription) {
    for (const tok of segment.tokens) {
      // Skip special tokens like [_BEG_], [_TT_125], etc.
      if (tok.text.startsWith("[") && tok.text.endsWith("]")) continue;

      const startMs = tok.t_dtw !== -1 ? tok.t_dtw * 10 : tok.offsets.from;
      const endMs = tok.offsets.to;

      if (tok.text.startsWith(" ")) {
        // Space prefix = new word boundary
        if (current && current.text.trim().length > 0) {
          words.push(current);
        }
        current = {
          text: tok.text.trimStart(),
          startMs,
          endMs,
        };
      } else {
        // No space = continuation of previous word
        if (current) {
          current.text += tok.text;
          current.endMs = endMs;
        } else {
          // First token in stream (no space prefix)
          current = {
            text: tok.text,
            startMs,
            endMs,
          };
        }
      }
    }
  }

  // Push final word
  if (current && current.text.trim().length > 0) {
    words.push(current);
  }

  const filtered = words.filter((w) => w.text.trim().length > 0);

  // Fix endMs: DTW start times are accurate but offsets.to comes from a
  // different alignment system and often precedes startMs. Use the next
  // word's startMs as this word's endMs for consistent timing from one source.
  for (let i = 0; i < filtered.length - 1; i++) {
    filtered[i].endMs = filtered[i + 1].startMs;
  }
  // Last word: ensure at least 200ms duration
  if (filtered.length > 0) {
    const last = filtered[filtered.length - 1];
    if (last.endMs <= last.startMs) {
      last.endMs = last.startMs + 200;
    }
  }

  return filtered;
}
