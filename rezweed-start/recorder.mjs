/**
 * Purpose-built recorder for the rezweed.com/start owner walkthrough clips.
 *
 * Why not scripts/replay-demo.mjs: two reasons, both fatal for this job.
 *   1. rezweed's globals.css sets `scroll-behavior: smooth`, so puppeteer's
 *      ElementHandle.click() stability check never settles and the call hangs
 *      forever. Clicking by computed coordinate sidesteps it entirely.
 *   2. Chrome's screencast does not capture the OS pointer, and we are not
 *      running the MCP fork that draws one. A help video where form fields fill
 *      themselves with no visible cursor teaches nothing, so we inject our own.
 *
 * Everything here is deliberately slow. These clips are watched once, by someone
 * trying to copy what they see on their own screen.
 */
import puppeteer from "puppeteer-core";
import { appendFileSync, mkdirSync } from "fs";
import { dirname } from "path";

const LOG = process.env.REC_LOG || "/dev/stderr";
export const log = (...a) => appendFileSync(LOG, "[rec] " + a.join(" ") + "\n");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Which server to record against — re-exported so a flow can take everything
 *  from one import. Defined in config.mjs, which is the only place that knows
 *  anything about a particular instance. */
export { BASE } from "./config.mjs";

/** Fake pointer, adapted from lib/cursor.js — bigger, and with a slower ease so
 *  the eye can follow it across a 1920px viewport. */
const CURSOR_JS = `(() => {
  if (window.__mc) return;
  const addStyle = () => {
    if (!document.documentElement || document.getElementById('rz-style')) return;
    const s = document.createElement('style');
    s.id = 'rz-style';
    s.textContent = '@keyframes rz-ring{0%{transform:translate(-50%,-50%) scale(.3);opacity:.75}100%{transform:translate(-50%,-50%) scale(1.6);opacity:0}}';
    document.documentElement.appendChild(s);
  };
  addStyle();
  const mk = () => {
    addStyle();
    if (!document.body) return;
    if (document.getElementById('rz-cursor')) return;
    const c = document.createElement('div');
    c.id = 'rz-cursor';
    c.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.45 0 .67-.54.35-.85L5.85 2.35a.5.5 0 0 0-.35.86z" fill="#fff" stroke="#111" stroke-width="1.4"/></svg>';
    c.style.cssText = 'position:fixed;left:-80px;top:-80px;z-index:2147483647;pointer-events:none;filter:drop-shadow(1px 2px 3px rgba(0,0,0,.45));will-change:left,top';
    document.body.appendChild(c);
  };
  mk();
  document.addEventListener('DOMContentLoaded', mk);
  if (document.documentElement) new MutationObserver(mk).observe(document.documentElement, {childList:true, subtree:true});
  window.__mc = (x, y, ms) => {
    const c = document.getElementById('rz-cursor'); if (!c) return;
    c.style.transition = ms ? 'left ' + ms + 'ms cubic-bezier(.33,.02,.24,1), top ' + ms + 'ms cubic-bezier(.33,.02,.24,1)' : 'none';
    c.style.left = x + 'px'; c.style.top = y + 'px';
  };
  window.__beat = (() => {
    let n = 0, b = null;
    return () => {
      if (!document.body) return;
      if (!b || !b.isConnected) {
        b = document.createElement('div');
        b.id = 'rz-beat';
        b.style.cssText = 'position:fixed;right:0;bottom:0;width:2px;height:2px;opacity:.004;pointer-events:none;z-index:2147483645;background:#000;will-change:transform';
        document.body.appendChild(b);
      }
      b.style.transform = 'translateZ(0) rotate(' + ((n++ % 2) ? 0.0012 : 0) + 'deg)';
    };
  })();
  window.__cp = () => {
    const c = document.getElementById('rz-cursor'); if (!c) return;
    const r = document.createElement('div');
    r.style.cssText = 'position:fixed;left:' + c.style.left + ';top:' + c.style.top + ';width:44px;height:44px;border-radius:50%;border:2.5px solid rgba(45,106,79,.85);pointer-events:none;z-index:2147483646;animation:rz-ring .5s ease-out forwards';
    document.body.appendChild(r); setTimeout(() => r.remove(), 560);
  };
})()`;

export async function connect({ port = 9333, width = 1280, height = 720 } = {}) {
  const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const browser = await puppeteer.connect({ browserWSEndpoint: v.webSocketDebuggerUrl });
  const page = (await browser.pages())[0];
  await page.setViewport({ width, height });
  // Survives every navigation, so the pointer never vanishes mid-clip.
  await page.evaluateOnNewDocument(CURSOR_JS);
  return { browser, page };
}

/** Cursor state is tracked here so movements can be eased by distance. */
let cx = 640, cy = 640;

export function makeCtx(page) {
  const ensureCursor = () => page.evaluate(CURSOR_JS).catch(() => {});

  const box = async (sel) => {
    const h = await page.$(sel);
    if (!h) throw new Error(`no element: ${sel}`);
    const b = await h.boundingBox();
    if (!b) throw new Error(`element not visible: ${sel}`);
    return { h, b, x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
  };

  /** Move the drawn pointer AND the real mouse. Duration scales with distance so
   *  short hops feel quick and long ones stay followable. */
  const moveTo = async (x, y, extra = 0) => {
    const dist = Math.hypot(x - cx, y - cy);
    const ms = Math.min(1100, Math.max(320, Math.round(dist * 1.15)));
    await ensureCursor();
    await page.evaluate((a, b, m) => window.__mc(a, b, m), x, y, ms);
    await page.mouse.move(x, y, { steps: 12 });
    cx = x; cy = y;
    await sleep(ms + 130 + extra);
  };

  const ctx = {
    page,
    async goto(url) {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 40000 });
      await sleep(1600);
      await ensureCursor();
    },
    /** Our own eased scroll — the page's `scroll-behavior: smooth` is disabled
     *  during recording because it makes puppeteer hang, so we animate it here
     *  and keep the pleasant look. */
    async scrollToEl(sel, { block = 0.32 } = {}) {
      const target = await page.evaluate((s, bl) => {
        const e = document.querySelector(s);
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return Math.max(0, Math.round(window.scrollY + r.top - window.innerHeight * bl));
      }, sel, block);
      if (target === null) throw new Error(`no element to scroll to: ${sel}`);
      const from = await page.evaluate(() => window.scrollY);
      const steps = 26;
      for (let i = 1; i <= steps; i++) {
        const p = i / steps;
        const e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        await page.evaluate((y) => window.scrollTo(0, y), Math.round(from + (target - from) * e));
        await sleep(26);
      }
      await sleep(320);
    },
    async click(sel, { settle = 700 } = {}) {
      const first = await box(sel);
      await moveTo(first.x, first.y);
      const { x, y } = await box(sel);           // re-resolve: the page may have reflowed
      if (Math.hypot(x - first.x, y - first.y) > 4) await moveTo(x, y);
      await page.evaluate(() => window.__cp && window.__cp());
      await sleep(120);
      await page.mouse.click(x, y);
      log(`click ${sel}`);
      await sleep(settle);
    },
    /** Click via the element's own .click() but still draw the pointer — for
     *  targets where a synthetic coordinate click races React re-renders. */
    async clickDom(sel, { settle = 700 } = {}) {
      const first = await box(sel);
      await moveTo(first.x, first.y);
      const { x, y } = await box(sel);
      if (Math.hypot(x - first.x, y - first.y) > 4) await moveTo(x, y);
      await page.evaluate(() => window.__cp && window.__cp());
      await sleep(120);
      await page.evaluate((s) => document.querySelector(s).click(), sel);
      log(`clickDom ${sel}`);
      await sleep(settle);
    },
    async type(sel, text, { delay = 95, settle = 600 } = {}) {
      const first = await box(sel);
      await moveTo(first.x, first.y);
      const { x, y } = await box(sel);
      if (Math.hypot(x - first.x, y - first.y) > 4) await moveTo(x, y);
      await page.evaluate(() => window.__cp && window.__cp());
      await page.mouse.click(x, y);
      await sleep(220);
      // Focus explicitly as well: a coordinate click can be swallowed by an
      // overlay that appeared during the glide, and typing into <body> is silent.
      await page.focus(sel);
      // Replace whatever is there rather than appending to it. A field that is
      // reused across beats (the till search is used three times) keeps its last
      // value, and a stray keystroke landing before focus settles leaves a prefix
      // — both of which produced text like "big9 055550177" instead of a number.
      const had = await page.$eval(sel, (e) => e.value);
      if (had) log(`  (clearing "${had}" from ${sel})`);
      await page.keyboard.down("Control");
      await page.keyboard.press("KeyA");
      await page.keyboard.up("Control");
      // Type one character at a time, re-taking focus if it moved. The till
      // re-focuses fields on its own as state changes — the amount box grabs
      // focus the instant a member is found — so a straight keyboard.type()
      // scatters the tail of a word into whichever input React just picked,
      // which is where "9o05m5550177" came from.
      for (const ch of text) {
        const onTarget = await page.evaluate(
          (s2) => document.activeElement === document.querySelector(s2), sel,
        );
        if (!onTarget) await page.focus(sel);
        await page.keyboard.type(ch, { delay: 0 });
        await sleep(delay);
      }
      const got = await page.$eval(sel, (e) => e.value);
      if (got !== text) throw new Error(`type landed wrong on ${sel}: got "${got}" want "${text}"`);
      log(`type ${sel} = ${text}`);
      await sleep(settle);
    },
    async select(sel, value, { settle = 800 } = {}) {
      // A native select popup is an OS widget and never appears in a screencast,
      // so we set the value directly and let the closed control show the result.
      const first = await box(sel);
      await moveTo(first.x, first.y);
      await page.evaluate(() => window.__cp && window.__cp());
      await sleep(150);
      await page.select(sel, value);
      log(`select ${sel} = ${value}`);
      await sleep(settle);
    },
    /** <input type="time"> ignores plain typed characters here (the segmented
     *  control never takes them), so set the value through the native setter and
     *  fire the events React listens for. The pointer still moves to the field so
     *  the clip reads as a deliberate edit. */
    async setTime(sel, value, { settle = 900 } = {}) {
      const first = await box(sel);
      await moveTo(first.x, first.y);
      const { x, y } = await box(sel);
      if (Math.hypot(x - first.x, y - first.y) > 4) await moveTo(x, y);
      await page.evaluate(() => window.__cp && window.__cp());
      await page.mouse.click(x, y);
      await sleep(320);
      // "08:00 PM" -> "20:00", the 24h value the element actually holds.
      const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(value.trim());
      if (!m) throw new Error(`bad time: ${value}`);
      let h = Number(m[1]) % 12;
      if (/pm/i.test(m[3])) h += 12;
      const v = `${String(h).padStart(2, "0")}:${m[2]}`;
      await page.evaluate((s, val) => {
        const el = document.querySelector(s);
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(el, val);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }, sel, v);
      const got = await page.$eval(sel, (e) => e.value);
      if (got !== v) throw new Error(`setTime failed on ${sel}: got "${got}" want "${v}"`);
      log(`setTime ${sel} = ${value} (${v})`);
      await sleep(settle);
    },
    /** <input type="range"> under React: set through the native setter and fire
     *  the events React listens for, then drag the pointer along the track so the
     *  clip shows the handle moving rather than teleporting. */
    async setRange(sel, value, { settle = 900 } = {}) {
      const { b } = await box(sel);
      const startX = Math.round(b.x + 6);
      const y = Math.round(b.y + b.height / 2);
      await moveTo(startX, y);
      await page.evaluate(() => window.__cp && window.__cp());
      const { min, max } = await page.$eval(sel, (e) => ({ min: Number(e.min), max: Number(e.max) }));
      const frac = (value - min) / (max - min);
      const endX = Math.round(b.x + b.width * frac);
      const steps = 14;
      for (let i = 1; i <= steps; i++) {
        const v = min + (value - min) * (i / steps);
        await page.evaluate((s, val) => {
          const el = document.querySelector(s);
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
          setter.call(el, String(val));
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }, sel, Math.round(v * 10) / 10);
        await page.evaluate((a, bb) => window.__mc(a, bb, 60),
          Math.round(startX + (endX - startX) * (i / steps)), y);
        await sleep(55);
      }
      cx = endX; cy = y;
      log(`setRange ${sel} = ${await page.$eval(sel, (e) => e.value)}`);
      await sleep(settle);
    },
    /** Pick a file. The real <input type=file> is hidden behind a styled button
     *  and its OS dialog cannot be filmed anyway, so drive the pointer to the
     *  button the viewer sees and set the file on the input underneath. */
    async upload(triggerSel, inputSel, filePath, { settle = 1400 } = {}) {
      const first = await box(triggerSel);
      await moveTo(first.x, first.y);
      const { x, y } = await box(triggerSel);
      if (Math.hypot(x - first.x, y - first.y) > 4) await moveTo(x, y);
      await page.evaluate(() => window.__cp && window.__cp());
      await sleep(200);
      const input = await page.$(inputSel);
      if (!input) throw new Error(`no file input: ${inputSel}`);
      await input.uploadFile(filePath);
      log(`upload ${filePath.split("/").pop()}`);
      await sleep(settle);
    },
    /** Move the pointer onto something and pulse, without clicking. For controls
     *  worth showing but not worth firing — a native confirm() is painted by the
     *  browser, not the page, so it never appears in a screencast and a click on
     *  one reads as an unexplained pause. */
    async pointAt(sel, { settle = 1200 } = {}) {
      const first = await box(sel);
      await moveTo(first.x, first.y);
      const { x, y } = await box(sel);
      if (Math.hypot(x - first.x, y - first.y) > 4) await moveTo(x, y);
      await page.evaluate(() => window.__cp && window.__cp());
      log(`pointAt ${sel}`);
      await sleep(settle);
    },
    note(msg) { log(`note: ${msg}`); },
    async waitForText(text, timeout = 20000) {
      await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);
      log(`saw "${text}"`);
    },
    async pause(ms) { await sleep(ms); },
    /** Block until the document stops reflowing, so the first click of a clip
     *  is not aimed at coordinates that are about to move. */
    async settle(timeout = 8000) {
      const t0 = Date.now();
      let last = null, stable = 0;
      while (Date.now() - t0 < timeout) {
        const h = await page.evaluate(() => document.body.scrollHeight + "x" + window.innerWidth);
        stable = h === last ? stable + 1 : 0;
        last = h;
        if (stable >= 3) return;
        await sleep(200);
      }
    },
    moveTo,
    ensureCursor,
  };
  return ctx;
}

export async function record(page, path, fn) {
  mkdirSync(dirname(path), { recursive: true });
  const rec = await page.screencast({ path });
  const t0 = Date.now();
  // See window.__beat: without this, still moments are not recorded at all and
  // the clip both runs short and loses whatever was on screen at the end.
  const beat = setInterval(() => {
    page.evaluate(() => window.__beat && window.__beat()).catch(() => {});
  }, 100);
  log(`recording -> ${path}`);
  try { await fn(); } finally {
    await sleep(1200);            // let the final state paint before cutting
    clearInterval(beat);
    await rec.stop();
    log(`stopped -> ${path} (wall ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
}
