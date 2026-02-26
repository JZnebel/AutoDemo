/**
 * Pluggable avatar (talking head) generation.
 *
 * Providers:
 *   sadtalker  — Local GPU, open-source, single image → talking video
 *   liveportrait — Local GPU, newer architecture (stub)
 *   echomimic  — Local GPU, multi-modal (stub)
 *   none       — Skip avatar generation entirely
 *
 * Usage:
 *   import { generateAvatar, listProviders, copyToPublic } from './lib/avatar/index.js';
 *   const { videoPath } = await generateAvatar({ image, audio, provider: 'sadtalker' });
 *   copyToPublic(videoPath);  // copies to demo-render/public/avatar.mp4
 */

import { existsSync, copyFileSync, mkdirSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, "../../demo-render/public");

// Lazy-loaded providers
const providers = {
  sadtalker: () => import("./sadtalker.js"),
  // Future providers — stubs that throw helpful errors
  liveportrait: () => Promise.resolve({
    name: "liveportrait",
    description: "LivePortrait (local GPU) — not yet integrated",
    isAvailable: () => false,
    generate: () => { throw new Error("LivePortrait provider not yet implemented. Use sadtalker."); },
  }),
  echomimic: () => Promise.resolve({
    name: "echomimic",
    description: "EchoMimic v3 (local GPU) — not yet integrated",
    isAvailable: () => false,
    generate: () => { throw new Error("EchoMimic provider not yet implemented. Use sadtalker."); },
  }),
  none: () => Promise.resolve({
    name: "none",
    description: "No avatar — skip talking head generation",
    isAvailable: () => true,
    generate: () => ({ videoPath: null, duration: 0 }),
  }),
};

/**
 * Resolve which provider to use.
 */
function resolveProvider(name) {
  const key = (name || process.env.AVATAR_PROVIDER || "sadtalker").toLowerCase();
  if (!providers[key]) {
    throw new Error(`Unknown avatar provider: "${key}". Available: ${Object.keys(providers).join(", ")}`);
  }
  return key;
}

/**
 * Generate a talking head avatar video.
 *
 * @param {Object} options
 * @param {string} options.image       - Path to source face image
 * @param {string} options.audio       - Path to narration audio
 * @param {string} [options.provider]  - Provider name (default: AVATAR_PROVIDER env or 'sadtalker')
 * @param {string} [options.outputDir] - Output directory
 * @param {Object} [options.providerOptions] - Provider-specific options (poseStyle, size, etc.)
 * @returns {Promise<{ videoPath: string|null, duration: number }>}
 */
export async function generateAvatar(options) {
  const providerKey = resolveProvider(options.provider);
  const provider = await providers[providerKey]();

  if (!provider.isAvailable()) {
    console.warn(`  [avatar] Provider "${providerKey}" is not available. Skipping avatar generation.`);
    return { videoPath: null, duration: 0 };
  }

  return provider.generate({
    ...options.providerOptions,
    image: options.image,
    audio: options.audio,
    outputDir: options.outputDir,
    verbose: options.verbose,
  });
}

/**
 * Copy a generated avatar video to the Remotion public/ directory
 * so AvatarPip.tsx can use it via staticFile("avatar.mp4").
 *
 * @param {string} videoPath - Path to the generated avatar video
 * @returns {string} The destination path
 */
export function copyToPublic(videoPath) {
  if (!videoPath) return null;

  const dest = join(PUBLIC_DIR, "avatar.mp4");
  mkdirSync(PUBLIC_DIR, { recursive: true });
  copyFileSync(videoPath, dest);
  console.log(`  [avatar] Copied to ${dest}`);
  return dest;
}

/**
 * List all available providers with status.
 */
export async function listProviders() {
  const results = [];
  for (const [key, loader] of Object.entries(providers)) {
    const provider = await loader();
    results.push({
      name: key,
      description: provider.description,
      available: provider.isAvailable(),
    });
  }
  return results;
}

/**
 * Check if a reference image exists in the default location.
 */
export function getDefaultImage() {
  const candidates = [
    join(PUBLIC_DIR, "avatar-source.png"),
    join(PUBLIC_DIR, "avatar-source.jpg"),
    resolve(__dirname, "../../assets/avatar-source.png"),
    resolve(__dirname, "../../assets/avatar-source.jpg"),
  ];
  return candidates.find((p) => existsSync(p)) || null;
}
