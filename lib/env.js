import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

/**
 * Load environment variables from a .env file.
 * Supports comments (#), quoted values, and multi-segment values with = signs.
 * @param {string} [path] - Path to .env file. Defaults to project root .env
 */
export function loadEnv(path) {
  if (!path) {
    // Default to .env in the agent-video project root
    const __dirname = dirname(fileURLToPath(import.meta.url));
    path = join(__dirname, "..", ".env");
  }

  if (!existsSync(path)) {
    console.warn(`[env] No .env file found at ${path}`);
    return;
  }

  const content = readFileSync(path, "utf-8");
  for (const line of content.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = line.substring(0, eqIdx).trim();
    const value = line.substring(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    process.env[key] = value;
  }
}
