/**
 * Pluggable TTS provider router.
 *
 * All providers return a normalized result:
 * {
 *   audioBuffer: Buffer,    // Raw audio bytes
 *   audioPath: string|null, // Path to written file (if outputPath provided)
 *   duration: number,       // Audio duration in seconds
 *   durationMs: number,     // Audio duration in milliseconds
 *   segments: Array|null,   // Per-segment timing (if provider supports it)
 *   wordTimings: Array|null,// Word-level timing (if provider supports it, else use Whisper)
 *   raw: object,            // Provider-specific raw data
 * }
 *
 * Usage:
 *   import { generateSpeech, listProviders } from './lib/tts/index.js';
 *
 *   // Uses TTS_PROVIDER env or defaults to 'edge'
 *   const result = await generateSpeech("Hello world", { outputPath: "narration.mp3" });
 *
 *   // Explicit provider
 *   const result = await generateSpeech("Hello world", { provider: "elevenlabs" });
 *
 *   // Draft mode (free, fast)
 *   const result = await generateSpeech("Hello world", { provider: "edge", voice: "chris" });
 */

import { elevenlabs, calculateSegmentTimings } from "./elevenlabs.js";
import { edgeTts } from "./edge-tts.js";
import { kokoro } from "./kokoro.js";

const providers = {
  elevenlabs,
  edge: edgeTts,
  "edge-tts": edgeTts,
  kokoro,
};

// Default to 'edge' (free) unless explicitly set
const DEFAULT_PROVIDER = "edge";

/**
 * Generate speech audio from text using the configured provider.
 *
 * @param {string} text - The text to synthesize
 * @param {object} [options]
 * @param {string} [options.provider] - Provider name: "elevenlabs", "edge", "kokoro"
 * @param {string} [options.outputPath] - Write audio file to this path
 * @param {string} [options.voice] - Voice name (provider-specific)
 * @param {object} [options.*] - Additional provider-specific options
 * @returns {Promise<{audioBuffer, audioPath, duration, durationMs, segments, wordTimings, raw}>}
 */
export async function generateSpeech(text, options = {}) {
  const providerName = options.provider || process.env.TTS_PROVIDER || DEFAULT_PROVIDER;
  const provider = providers[providerName];

  if (!provider) {
    const available = Object.keys(providers).filter((k) => providers[k] !== providers[providers[k]]);
    throw new Error(
      `Unknown TTS provider: "${providerName}". Available: ${listProviders().map((p) => p.name).join(", ")}`
    );
  }

  console.log(`  TTS provider: ${provider.name}${provider.requiresApiKey ? " (API key required)" : " (free)"}`);
  return provider.generate(text, options);
}

/**
 * List available TTS providers with metadata.
 */
export function listProviders() {
  return [
    { name: "elevenlabs", label: "ElevenLabs", free: false, quality: "premium", timestamps: "character-level" },
    { name: "edge", label: "Microsoft Edge TTS", free: true, quality: "good", timestamps: "segment-level (VTT)" },
    { name: "kokoro", label: "Kokoro (local)", free: true, quality: "good", timestamps: "none (use Whisper)" },
  ];
}

/**
 * Get a specific provider instance.
 */
export function getProvider(name) {
  return providers[name] || null;
}

// Re-export ElevenLabs-specific helpers for backward compatibility
export { calculateSegmentTimings } from "./elevenlabs.js";

// Re-export individual providers for direct use
export { elevenlabs } from "./elevenlabs.js";
export { edgeTts } from "./edge-tts.js";
export { kokoro } from "./kokoro.js";
