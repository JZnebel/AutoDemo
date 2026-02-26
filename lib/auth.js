import { readFileSync, writeFileSync, existsSync } from "fs";
import { ab } from "./ab.js";

const DEFAULT_PATH = ".auth-state.json";

/**
 * Save the current browser's auth state (cookies + localStorage) to a JSON file.
 * Call this after a successful login to avoid repeating login in subsequent scenes.
 *
 * @param {object} [options]
 * @param {string} [options.path=".auth-state.json"] - File path to save state
 */
export function saveAuthState(options = {}) {
  const savePath = options.path || DEFAULT_PATH;

  // Extract cookies
  const cookiesJson = ab(
    `eval "JSON.stringify(document.cookie.split('; ').map(c => { const [k,...v] = c.split('='); return {name:k,value:v.join('=')} }))"`,
    { timeout: 5000, quiet: true }
  );

  // Extract localStorage
  const storageJson = ab(
    `eval "JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])))"`,
    { timeout: 5000, quiet: true }
  );

  const state = {
    savedAt: new Date().toISOString(),
    cookies: safeParseJson(cookiesJson, []),
    localStorage: safeParseJson(storageJson, {}),
  };

  writeFileSync(savePath, JSON.stringify(state, null, 2));
  console.log(`  auth: saved state to ${savePath}`);
}

/**
 * Load auth state from file and inject into the current browser page.
 * Must be called after navigating to the target origin (cookies are origin-scoped).
 *
 * @param {object} [options]
 * @param {string} [options.path=".auth-state.json"] - File path to load state from
 * @returns {boolean} true if state was loaded, false if file not found
 */
export function loadAuthState(options = {}) {
  const loadPath = options.path || DEFAULT_PATH;

  if (!existsSync(loadPath)) {
    console.log(`  auth: no saved state at ${loadPath}`);
    return false;
  }

  const state = JSON.parse(readFileSync(loadPath, "utf-8"));

  // Restore cookies
  if (state.cookies && state.cookies.length > 0) {
    for (const cookie of state.cookies) {
      if (cookie.name && cookie.value) {
        const escaped = cookie.value.replace(/'/g, "\\'");
        ab(
          `eval "document.cookie = '${cookie.name}=${escaped}; path=/'"`,
          { timeout: 5000, quiet: true }
        );
      }
    }
  }

  // Restore localStorage
  if (state.localStorage) {
    for (const [key, value] of Object.entries(state.localStorage)) {
      const escapedKey = key.replace(/'/g, "\\'");
      const escapedVal = String(value).replace(/'/g, "\\'").replace(/\\/g, "\\\\");
      ab(
        `eval "localStorage.setItem('${escapedKey}', '${escapedVal}')"`,
        { timeout: 5000, quiet: true }
      );
    }
  }

  console.log(
    `  auth: loaded state from ${loadPath} (${state.cookies?.length || 0} cookies, ${Object.keys(state.localStorage || {}).length} storage keys)`
  );
  return true;
}

function safeParseJson(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
