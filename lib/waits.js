import { ab, sleep } from "./ab.js";

/**
 * Poll until a selector is visible on the page.
 * @param {string} selector - Playwright selector
 * @param {number} [timeout=10000] - Max wait time in ms
 * @returns {boolean} true if found, false if timed out
 */
export async function waitForVisible(selector, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = ab(
      `eval "!!document.querySelector('${selector.replace(/'/g, "\\'")}')"`,
      { timeout: 5000, quiet: true }
    );
    if (result === "true") return true;
    await sleep(250);
  }
  console.warn(`  waitForVisible timed out: ${selector}`);
  return false;
}

/**
 * Poll until a selector is no longer present on the page.
 * @param {string} selector - Playwright selector
 * @param {number} [timeout=10000] - Max wait time in ms
 * @returns {boolean} true if gone, false if timed out
 */
export async function waitForGone(selector, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = ab(
      `eval "!!document.querySelector('${selector.replace(/'/g, "\\'")}')"`,
      { timeout: 5000, quiet: true }
    );
    if (result === "false") return true;
    await sleep(250);
  }
  console.warn(`  waitForGone timed out: ${selector}`);
  return false;
}

/**
 * Poll until an element contains specific text.
 * @param {string} selector - Playwright selector
 * @param {string} text - Text to search for (case-sensitive substring match)
 * @param {number} [timeout=10000] - Max wait time in ms
 * @returns {boolean} true if found, false if timed out
 */
export async function waitForText(selector, text, timeout = 10000) {
  const escapedSelector = selector.replace(/'/g, "\\'");
  const escapedText = text.replace(/'/g, "\\'").replace(/"/g, '\\"');
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = ab(
      `eval "(document.querySelector('${escapedSelector}')?.textContent || '').includes('${escapedText}')"`,
      { timeout: 5000, quiet: true }
    );
    if (result === "true") return true;
    await sleep(250);
  }
  console.warn(`  waitForText timed out: ${selector} / "${text}"`);
  return false;
}

/**
 * Wait until a specific number of seconds have elapsed since a reference time.
 * Used to synchronize recording actions with narration timing.
 *
 * @param {number} recordStartMs - Date.now() when recording started
 * @param {number} targetSec - Target elapsed time in seconds
 */
export async function waitUntil(recordStartMs, targetSec) {
  const remaining = targetSec * 1000 - (Date.now() - recordStartMs);
  if (remaining > 0) await sleep(remaining);
}
