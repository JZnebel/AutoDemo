import { ab, sleep } from "./ab.js";

/**
 * JavaScript source that creates a fake cursor element with click animation.
 * Exposes window.__mc(x,y) to move and window.__cp() to trigger click pulse.
 */
export const CURSOR_JS = `(() => {
  if (document.getElementById('fake-cursor')) return;
  var s = document.createElement('style');
  s.textContent = '@keyframes click-ring { 0% { transform: translate(-50%,-50%) scale(0.3); opacity: 0.7; } 100% { transform: translate(-50%,-50%) scale(1.5); opacity: 0; } }';
  document.head.appendChild(s);
  const c = document.createElement('div');
  c.id = 'fake-cursor';
  c.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.45 0 .67-.54.35-.85L5.85 2.35a.5.5 0 0 0-.35.86z" fill="white" stroke="black" stroke-width="1.5"/></svg>';
  c.style.cssText = 'position:fixed;top:-50px;left:-50px;z-index:999999;pointer-events:none;transition:all 0.25s cubic-bezier(0.25,0.1,0.25,1);filter:drop-shadow(1px 2px 2px rgba(0,0,0,0.4));';
  document.body.appendChild(c);
  window.__mc = (x, y) => { c.style.left = x + 'px'; c.style.top = y + 'px'; };
  window.__cp = () => {
    c.style.transform = 'scale(0.8)';
    setTimeout(() => { c.style.transform = 'scale(1)'; }, 150);
    var ring = document.createElement('div');
    ring.style.cssText = 'position:fixed;left:' + c.style.left + ';top:' + c.style.top + ';width:40px;height:40px;border-radius:50%;border:2px solid rgba(59,130,246,0.7);pointer-events:none;z-index:999998;animation:click-ring 0.45s ease-out forwards;';
    document.body.appendChild(ring);
    setTimeout(() => ring.remove(), 500);
  };
})()`;

/**
 * Inject the fake cursor into the current page.
 * Must be called after page load and again after full-page navigations.
 */
export function injectCursor() {
  const js = CURSOR_JS.replace(/\n/g, " ").replace(/"/g, '\\"');
  ab(`eval "${js}"`, { timeout: 10000 });
}

/**
 * Animate cursor to an element's center, show click pulse, then click.
 *
 * @param {string} selector - Playwright selector for the target element
 * @param {object} [options]
 * @param {number} [options.timeout] - Timeout for the click command
 * @param {number} [options.transitionMs=280] - Wait time for CSS cursor transition
 */
export async function cursorClick(selector, options = {}) {
  const transitionMs = options.transitionMs ?? 280;

  // Get bounding box
  const boxResult = ab(`get box "${selector}"`);
  let box = null;
  try {
    const jsonMatch = boxResult.match(/\{[\s\S]*\}/);
    if (jsonMatch) box = JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error("  box parse error:", e.message);
  }

  if (box) {
    const cx = Math.round(box.x + box.width / 2);
    const cy = Math.round(box.y + box.height / 2);
    console.log(`  cursor -> (${cx}, ${cy})`);
    ab(`eval "window.__mc(${cx}, ${cy})"`, { timeout: 5000 });
    await sleep(transitionMs);
    ab(`eval "window.__cp()"`, { timeout: 5000 });
    await sleep(100);
  } else {
    console.log("  cursor: no box found, clicking without animation");
  }

  ab(`click "${selector}"`, { timeout: options.timeout });
}
