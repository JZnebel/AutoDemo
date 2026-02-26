import { writeFileSync } from "fs";

/**
 * ElevenLabs TTS provider.
 * Premium quality, character-level timestamps, voice cloning support.
 * Requires ELEVENLABS_API_KEY env var.
 */

const DEFAULT_VOICE = "iP95p4xoKVk53GoZ742B"; // Chris
const DEFAULT_MODEL = "eleven_multilingual_v2";

export const elevenlabs = {
  name: "elevenlabs",
  requiresApiKey: true,

  /**
   * @param {string} text - Full narration text
   * @param {object} [options]
   * @param {string} [options.voiceId] - ElevenLabs voice ID
   * @param {string} [options.apiKey] - API key (or ELEVENLABS_API_KEY env)
   * @param {string} [options.outputPath] - Write MP3 to this path
   * @param {string} [options.modelId] - ElevenLabs model
   * @returns {Promise<{audioBuffer: Buffer, audioPath: string|null, duration: number, segments: null, wordTimings: Array|null, raw: object}>}
   */
  async generate(text, options = {}) {
    const voiceId = options.voiceId || process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
    const apiKey = options.apiKey || process.env.ELEVENLABS_API_KEY;
    const modelId = options.modelId || DEFAULT_MODEL;

    if (!apiKey) {
      throw new Error("ELEVENLABS_API_KEY not set. Get one at https://elevenlabs.io/app/settings/api-keys");
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text, model_id: modelId }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ElevenLabs API error (${response.status}): ${error}`);
    }

    const data = await response.json();
    const audioBuffer = Buffer.from(data.audio_base64, "base64");

    if (options.outputPath) {
      writeFileSync(options.outputPath, audioBuffer);
    }

    const alignment = data.alignment || {};
    const charStartTimes = alignment.character_start_times_seconds || [];
    const charEndTimes = alignment.character_end_times_seconds || [];
    const characters = alignment.characters || [];
    const duration = charEndTimes.length > 0 ? charEndTimes[charEndTimes.length - 1] : 3;

    return {
      audioBuffer,
      audioPath: options.outputPath || null,
      duration,
      durationMs: Math.round(duration * 1000),
      segments: null, // Use calculateSegmentTimings for per-segment timing
      wordTimings: null, // ElevenLabs gives char-level, not word-level — use Whisper for words
      raw: { alignment, charStartTimes, charEndTimes, characters },
    };
  },
};

/**
 * Calculate per-segment start/end times from character-level alignment data.
 * Segments are assumed to have been joined with single spaces.
 */
export function calculateSegmentTimings(segments, charStartTimes, charEndTimes) {
  const totalDuration = charEndTimes.length > 0 ? charEndTimes[charEndTimes.length - 1] : 0;
  let charOffset = 0;

  return segments.map((seg) => {
    const startSec = charOffset < charStartTimes.length ? charStartTimes[charOffset] : 0;
    const endCharOffset = charOffset + seg.text.length;
    const endSec = endCharOffset < charEndTimes.length ? charEndTimes[endCharOffset] : totalDuration;
    charOffset = endCharOffset + 1; // +1 for joining space
    return { ...seg, startSec, endSec, durationSec: endSec - startSec };
  });
}
