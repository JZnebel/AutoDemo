/**
 * Backward-compatible TTS module.
 *
 * The original generateAudio() and calculateSegmentTimings() functions
 * still work exactly as before. New code should use the pluggable
 * provider system in lib/tts/index.js instead.
 *
 * Migration guide:
 *   // Old (ElevenLabs only):
 *   import { generateAudio, calculateSegmentTimings } from './lib/tts.js';
 *
 *   // New (any provider):
 *   import { generateSpeech, calculateSegmentTimings } from './lib/tts/index.js';
 */

// Re-export the pluggable system
export { generateSpeech, calculateSegmentTimings, listProviders, getProvider } from "./tts/index.js";

// Keep the original ElevenLabs-specific function for backward compat
// (pos-demo.mjs and admin-demo.mjs import generateAudio from here)
import { elevenlabs } from "./tts/elevenlabs.js";
export { calculateSegmentTimings as _calcSegTimings } from "./tts/elevenlabs.js";

export async function generateAudio(text, options = {}) {
  return elevenlabs.generate(text, {
    voiceId: options.voiceId,
    apiKey: options.apiKey,
    outputPath: options.outputPath,
    modelId: options.modelId,
  }).then((result) => ({
    // Map to the old return shape that demo scripts expect
    audioBuffer: result.audioBuffer,
    alignment: result.raw.alignment || {},
    durationSec: result.duration,
    durationMs: result.durationMs,
    charStartTimes: result.raw.charStartTimes || [],
    charEndTimes: result.raw.charEndTimes || [],
    characters: result.raw.characters || [],
  }));
}
