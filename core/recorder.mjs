/**
 * The recorder: drives Chrome over CDP (puppeteer-core) while page.screencast() films it,
 * and gives flows a `ctx` of human-paced actions.
 *
 *  - Clicks go by computed coordinate, re-resolved just before use: a page with
 *    `scroll-behavior: smooth` makes puppeteer's ElementHandle.click() stability check
 *    hang forever.
 *  - Chrome's screencast never shows the OS pointer, so we draw our own, eased by distance.
 *  - Narration pacing: ctx.line(id) waits for the line before it to finish speaking, so the
 *    recording runs as long as the voice needs — a French read that runs longer simply
 *    makes a longer French take.
 *  - Waiting: every action waits for its target to be present, visible and still (re-found
 *    if the page replaced it), then for what the action started to finish (ctx.quiet).
 *  - Logging for the edit and the checks: what each action pointed at, the server waits,
 *    and the visible text once a second (ctx.actions / busy / snapshots / issues).
 *
 * Everything is deliberately slow. These clips are watched by someone trying to copy what
 * they see on their own screen.
 */
import puppeteer from "puppeteer-core";
import { appendFileSync, mkdirSync } from "fs";
import { dirname } from "path";

const LOG = process.env.REC_LOG || "/dev/stderr";
export const log = (...a) => appendFileSync(LOG, "[rec] " + a.join(" ") + "\n");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


/** Our own pointer — big, and with a slow ease so
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
  // When the page last changed its content (not counting our own pointer, click rings and
  // beat pixel) — ctx.quiet() waits for this to go still.
  window.__mut = Date.now();
  const ours = (n) => n && n.nodeType === 1 && (String(n.id || '').startsWith('rz-') || n.classList.contains('rz-ring'));
  if (document.documentElement) new MutationObserver((ms) => {
    for (const m of ms) {
      if (ours(m.target)) continue;
      if (m.type === 'childList' && [...m.addedNodes, ...m.removedNodes].every(ours)) continue;
      window.__mut = Date.now();
      return;
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  window.__cp = () => {
    const c = document.getElementById('rz-cursor'); if (!c) return;
    const r = document.createElement('div');
    r.className = 'rz-ring';
    r.style.cssText = 'position:fixed;left:' + c.style.left + ';top:' + c.style.top + ';width:44px;height:44px;border-radius:50%;border:2.5px solid rgba(45,106,79,.85);pointer-events:none;z-index:2147483646;animation:rz-ring .5s ease-out forwards';
    document.body.appendChild(r); setTimeout(() => r.remove(), 560);
  };
})()`;

export async function connect({ port = Number(process.env.AUTODEMO_CHROME_PORT || 9334), width = 1600, height = 900 } = {}) {
  const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const browser = await puppeteer.connect({ browserWSEndpoint: v.webSocketDebuggerUrl });
  const page = (await browser.pages())[0];
  await page.setViewport({ width, height });
  // Survives every navigation, so the pointer never vanishes mid-clip.
  await page.evaluateOnNewDocument(CURSOR_JS);
  return { browser, page };
}

/**
 * Selectors that helpers made by tagging an element (byText, topmost... set data-rec on it)
 * mapped to a function that tags it again. When the page redraws and replaces that element,
 * the tag is gone with it; the recorder calls this to find the new one instead of failing.
 */
export const refinders = new Map();

/** Every piece of text visible in the viewport right now, plus whether something on screen
 *  says it's busy (a spinner, aria-busy, "Saving…"). Used for the screen checks. */
const SCREEN_JS = () => {
  const vw = innerWidth, vh = innerHeight;
  const shown = (el) => {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      if (String(e.id || "").startsWith("rz-")) return false;
      const cs = getComputedStyle(e);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.15) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;
  };
  const norm = (t) => (t || "").replace(/\s+/g, " ").trim();
  const texts = new Set();
  const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = norm(n.nodeValue);
    if (t && /\p{L}/u.test(t) && n.parentElement && shown(n.parentElement)) texts.add(t);
  }
  // Whole labels too, for ones split across elements ("Complete" <b>"Sale"</b>)
  for (const el of document.querySelectorAll("button, a, label, h1, h2, h3, h4, th, [role=tab], [role=button], option:checked")) {
    const t = norm(el.innerText);
    if (t && t.length < 80 && shown(el)) texts.add(t);
  }
  // Radio and checkbox values are codes ("simple", "variation"), never shown to anyone.
  for (const el of document.querySelectorAll("input:not([type=hidden]):not([type=password]):not([type=radio]):not([type=checkbox]), textarea")) {
    if (!shown(el)) continue;
    for (const t of [norm(el.value), norm(el.placeholder)]) if (t && /\p{L}/u.test(t)) texts.add(t);
  }
  const busyEl = [...document.querySelectorAll('[aria-busy="true"], [role="progressbar"], .animate-spin, .spinner, .loading')].find(shown);
  const busyText = [...document.querySelectorAll("button:disabled")].map((b) => norm(b.innerText)).find((t) => /(…|\.\.\.)$/.test(t));
  const describe = (el) => norm(el.innerText).slice(0, 50) || el.getAttribute("aria-label") || el.getAttribute("role") || "spinner";
  return { texts: [...texts], busy: busyEl ? describe(busyEl) : busyText || null };
};

/** Cursor state is tracked here so movements can be eased by distance. */
let cx = 640, cy = 640;

/**
 * Narration pacing. Each clip's lines are synthesised before it is recorded, so their
 * lengths are known (durations: { lineId: seconds }). ctx.line(id) marks where a line
 * starts — but first waits until the line before it has finished speaking, plus a breath.
 * The action that follows a line() call happens while that line is heard, and the
 * recording runs as long as the narration needs: a French read that runs longer simply
 * makes a longer French recording, in step with its own voice.
 */
export function makeCtx(page, { durations = {}, gap = 0.35 } = {}) {
  const ensureCursor = () => page.evaluate(CURSOR_JS).catch(() => {});

  /** Wait until `sel` is on the page — re-finding it if the page replaced it — and visible
   *  with a box that holds still for two looks in a row (a list that is still redrawing, or a
   *  window still sliding in, moves between looks). */
  const box = async (sel, { timeout = 15000 } = {}) => {
    const t0 = Date.now();
    let last = null, why = "no element";
    while (Date.now() - t0 < timeout) {
      let h = await page.$(sel);
      if (!h && refinders.has(sel)) {
        await refinders.get(sel)().catch(() => {});
        h = await page.$(sel);
        if (h) log(`  (re-found ${sel} after the page replaced it)`);
      }
      const b = h && await h.boundingBox().catch(() => null);
      if (!h) why = "no element";
      else if (!b || b.width === 0 || b.height === 0) why = "element not visible";
      else {
        const key = [b.x, b.y, b.width, b.height].map(Math.round).join(",");
        if (key === last) return { h, b, x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
        last = key;
      }
      await sleep(150);
    }
    throw new Error(`${why}: ${sel} (waited ${timeout / 1000}s)`);
  };

  /** Is something else (a toast, a backdrop) drawn over the element's centre? Waits up to
   *  `wait` ms for it to clear, then notes it as a screen issue. */
  const uncovered = async (sel, x, y, wait = 4000) => {
    const t0 = Date.now();
    for (;;) {
      const cover = await page.evaluate((s, px, py) => {
        const e = document.querySelector(s);
        const at = document.elementFromPoint(px, py);
        if (!e || !at || e === at || e.contains(at) || at.contains(e) || String(at.id).startsWith("rz-")) return null;
        return (at.innerText || at.className?.toString?.() || at.tagName).replace(/\s+/g, " ").trim().slice(0, 60);
      }, sel, x, y).catch(() => null);
      if (!cover) return;
      if (Date.now() - t0 > wait) {
        log(`  COVERED: ${sel} has "${cover}" over it`);
        ctx.issues.push({ t: ctx.elapsed(), kind: "covered", sel, detail: cover });
        return;
      }
      await sleep(200);
    }
  };

  // Requests in flight, for ctx.quiet(). Streams and sockets never finish, so they don't count.
  const inflight = new Map();
  page.on("request", (r) => {
    if (!["eventsource", "websocket", "media", "ping"].includes(r.resourceType())) inflight.set(r, Date.now());
  });
  page.on("requestfinished", (r) => inflight.delete(r));
  page.on("requestfailed", (r) => inflight.delete(r));
  /** Requests the action started, not the register's background polling (drawer status,
   *  suggestions), which on a slow server is always running: anything that saves (not a GET),
   *  a page load, or a GET fired within 400ms of the action — and a GET only for its first
   *  3s: a refresh that slow isn't what the viewer is waiting to see. */
  const pending = (since) => [...inflight.entries()].filter(([r, t]) =>
    t >= since - 50 && Date.now() - t < 15000 &&
    (r.method() !== "GET" || r.resourceType() === "document" || (t - since < 400 && Date.now() - since < 3000))).map(([r]) => r);

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
    /** Set by record(): when the recording started, and where each line begins. */
    t0: null,
    marks: {},
    _speakingUntil: 0,
    /** Filled while recording, saved beside the clip (raw/<clip>.<lang>.screen.json):
     *  what each action pointed at, stretches spent waiting on the server, what was on
     *  screen each second, and problems noticed along the way. */
    actions: [],
    busy: [],
    snapshots: [],
    issues: [],
    elapsed() { return ctx.t0 ? (Date.now() - ctx.t0) / 1000 : 0; },
    async line(id) {
      if (!(id in durations)) throw new Error(`no narration line "${id}" (or it has no audio yet)`);
      if (id in ctx.marks) throw new Error(`line "${id}" used twice`);
      const wait = ctx._speakingUntil - ctx.elapsed();
      if (wait > 0) await sleep(wait * 1000);
      const at = ctx.elapsed();
      ctx.marks[id] = Math.round(at * 1000) / 1000;
      ctx._speakingUntil = at + durations[id] + gap;
      log(`line ${id} @ ${at.toFixed(2)}s (${durations[id].toFixed(1)}s)`);
      ctx.snap();
    },
    /**
     * Wait `min` ms (the pause the viewer needs to see what happened), then for the page to
     * finish what the action started: no requests in flight, nothing saying it's busy
     * ("Saving…", a spinner), and no content changes for a moment. Capped at `max`; a page
     * that just keeps changing (a ticking clock) is let go after 2s.
     */
    async quiet({ min = 0, max = 12000, since = Date.now() } = {}) {
      if (min) await sleep(min);
      const t0 = Date.now(), start = ctx.elapsed();
      let reason = null, lastReason = null;
      for (;;) {
        const s = await page.evaluate(() => ({
          still: Date.now() - (window.__mut || 0),
          busy: !!document.querySelector('[aria-busy="true"]') ||
            [...document.querySelectorAll("button:disabled")].some((b) => b.offsetParent && /(…|\.\.\.)$/.test(b.innerText.trim())),
        })).catch(() => ({ still: 9999, busy: false }));
        const net = pending(since);
        reason = net.length ? `${net.length} request(s): ${net.map((r) => r.method() + " " + r.url().replace(/^https?:\/\/[^/]+/, "").slice(0, 50)).join(", ")}`
          : s.busy ? "busy indicator" : s.still < 350 ? "page still changing" : null;
        if (reason) lastReason = reason;
        if (!reason) break;
        const waited = Date.now() - t0;
        if (waited > max || (reason === "page still changing" && waited > 2000)) {
          log(`  quiet: gave up after ${(waited / 1000).toFixed(1)}s (${reason})`);
          break;
        }
        await sleep(100);
      }
      const end = ctx.elapsed();
      if (ctx.t0 && end - start > 0.6) {
        ctx.busy.push({ start: Math.round(start * 1000) / 1000, end: Math.round(end * 1000) / 1000 });
        log(`  waited ${(end - start).toFixed(1)}s for the page (${lastReason})`);
      }
    },
    /** Note what an action is about, for zooming in on it afterwards. */
    _act(kind, sel, b) {
      if (ctx.t0 && b) ctx.actions.push({ t: Math.round(ctx.elapsed() * 1000) / 1000, kind, sel,
        box: [b.x, b.y, b.width, b.height].map(Math.round) });
    },
    /** Hold until the last line has been spoken, so the clip doesn't cut it off. */
    async finishSpeaking(extra = 0.6) {
      const wait = ctx._speakingUntil - ctx.elapsed() + extra;
      if (wait > 0) await sleep(wait * 1000);
    },
    async goto(url) {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 40000 });
      await ensureCursor();
      await ctx.quiet({ min: 1600, max: 20000 });
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
    /** Bring an element into view inside whatever scrolls it (a pop-up's body, a side
     *  panel), with an eased animation the eye can follow. */
    async reveal(sel, { block = 0.4, always = false } = {}) {
      await box(sel).catch(() => {});   // wait for it (re-finding it if replaced); the plan below reports a miss
      // Every scrolling box between the element and the page, inside out: a checkbox in a
      // scrolling list that is itself below the fold needs both scrolled, the list first.
      for (let level = 0; level < 4; level++) {
        const plan = await page.evaluate((s, bl, lv, al) => {
          const e = document.querySelector(s);
          if (!e) return null;
          const scrollers = [];
          for (let p = e.parentElement; p; p = p.parentElement) {
            if (p.scrollHeight > p.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(p).overflowY) &&
                p !== document.body && p !== document.documentElement) scrollers.push(p);
          }
          scrollers.push(document.scrollingElement);
          const sc = scrollers[lv];
          if (!sc) return { done: true };
          const er = e.getBoundingClientRect();
          const isDoc = sc === document.scrollingElement;
          const pr = isDoc ? { top: 0, height: window.innerHeight } : sc.getBoundingClientRect();
          // `always`: bring it to the requested height even if it is already peeking in at an edge.
          if (!al && er.top >= pr.top && er.bottom <= pr.top + pr.height) return { skip: true };
          document.querySelectorAll("[data-rec-scroller]").forEach((x) => x.removeAttribute("data-rec-scroller"));
          sc.setAttribute("data-rec-scroller", "1");
          const to = Math.max(0, Math.round(sc.scrollTop + (er.top - pr.top) - pr.height * bl));
          return { from: sc.scrollTop, to };
        }, sel, block, level, always);
        if (!plan) throw new Error(`no element to reveal: ${sel}`);
        if (plan.done) break;
        if (plan.skip) continue;
        const steps = 22;
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          await page.evaluate((y) => { const sc = document.querySelector("[data-rec-scroller]"); if (sc) sc.scrollTop = y; },
            Math.round(plan.from + (plan.to - plan.from) * e));
          await sleep(24);
        }
        await page.evaluate(() => document.querySelector("[data-rec-scroller]")?.removeAttribute("data-rec-scroller"));
        await sleep(300);
      }
    },
    async click(sel, { settle = 700 } = {}) {
      await ctx.reveal(sel);
      const first = await box(sel);
      await moveTo(first.x, first.y);
      const { x, y } = await box(sel);           // re-resolve: the page may have reflowed
      if (Math.hypot(x - first.x, y - first.y) > 4) await moveTo(x, y);
      await uncovered(sel, x, y);
      ctx._act("click", sel, (await box(sel)).b);
      await page.evaluate(() => window.__cp && window.__cp());
      await sleep(120);
      const since = Date.now();
      await page.mouse.click(x, y);
      log(`click ${sel}`);
      await ctx.quiet({ min: settle, since });
    },
    /** Click via the element's own .click() but still draw the pointer — for
     *  targets where a synthetic coordinate click races React re-renders. */
    async clickDom(sel, { settle = 700 } = {}) {
      await ctx.reveal(sel);
      const first = await box(sel);
      await moveTo(first.x, first.y);
      const { x, y } = await box(sel);
      if (Math.hypot(x - first.x, y - first.y) > 4) await moveTo(x, y);
      ctx._act("click", sel, (await box(sel)).b);
      await page.evaluate(() => window.__cp && window.__cp());
      await sleep(120);
      const since = Date.now();
      await page.evaluate((s) => document.querySelector(s).click(), sel);
      log(`clickDom ${sel}`);
      await ctx.quiet({ min: settle, since });
    },
    async type(sel, text, { delay = 95, settle = 600 } = {}) {
      await ctx.reveal(sel);
      const first = await box(sel);
      await moveTo(first.x, first.y);
      const { x, y } = await box(sel);
      if (Math.hypot(x - first.x, y - first.y) > 4) await moveTo(x, y);
      await uncovered(sel, x, y);
      ctx._act("type", sel, (await box(sel)).b);
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
      await ctx.quiet({ min: settle, since: Date.now() - 100 });   // a search-as-you-type lookup fires just after the last key
    },
    async select(sel, value, { settle = 800 } = {}) {
      // A native select popup is an OS widget and never appears in a screencast,
      // so we set the value directly and let the closed control show the result.
      const first = await box(sel);
      await moveTo(first.x, first.y);
      ctx._act("select", sel, first.b);
      await page.evaluate(() => window.__cp && window.__cp());
      await sleep(150);
      await page.select(sel, value);
      log(`select ${sel} = ${value}`);
      await ctx.quiet({ min: settle });
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
      ctx._act("type", sel, first.b);
      await ctx.quiet({ min: settle });
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
      ctx._act("type", sel, b);
      await ctx.quiet({ min: settle });
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
      ctx._act("click", triggerSel, first.b);
      await ctx.quiet({ min: settle });
    },
    /** Move the pointer onto something and pulse, without clicking. For controls
     *  worth showing but not worth firing — a native confirm() is painted by the
     *  browser, not the page, so it never appears in a screencast and a click on
     *  one reads as an unexplained pause. */
    async pointAt(sel, { settle = 1200 } = {}) {
      await ctx.reveal(sel);
      const first = await box(sel);
      await moveTo(first.x, first.y);
      const { x, y } = await box(sel);
      if (Math.hypot(x - first.x, y - first.y) > 4) await moveTo(x, y);
      await page.evaluate(() => window.__cp && window.__cp());
      ctx._act("point", sel, (await box(sel)).b);
      log(`pointAt ${sel}`);
      await sleep(settle);
    },
    note(msg) { log(`note: ${msg}`); },
    /** Record what's on screen now (while recording). */
    async snap() {
      if (!ctx.t0) return;
      const t = Math.round(ctx.elapsed() * 1000) / 1000;
      const s = await page.evaluate(SCREEN_JS).catch(() => null);
      if (s) ctx.snapshots.push({ t, ...s });
    },
    async waitForText(text, timeout = 20000) {
      await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);
      log(`saw "${text}"`);
    },
    async pause(ms) { await sleep(ms); },
    /** Wait for a result to show rather than pausing a fixed time and hoping: polls `check`
     *  (async, returns truthy when done) for up to `timeout`, then throws `message`. */
    async expect(check, message, timeout = 20000) {
      const t0 = Date.now();
      for (;;) {
        if (await check().catch(() => false)) return;
        if (Date.now() - t0 > timeout) throw new Error(typeof message === "function" ? await message() : message);
        await sleep(250);
      }
    },
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

/**
 * Record fn() to path. Returns the wall-clock length, which is the truth the video is
 * rescaled to afterwards (see normalize in run-flow.mjs): a heavy page makes puppeteer
 * over-generate frames, and line marks are in wall-clock time.
 */
export async function record(page, path, fn, ctx = null) {
  mkdirSync(dirname(path), { recursive: true });
  const rec = await page.screencast({ path });
  const t0 = Date.now();
  if (ctx) ctx.t0 = t0;
  // See window.__beat: without this, still moments are not recorded at all and
  // the clip both runs short and loses whatever was on screen at the end.
  const beat = setInterval(() => {
    page.evaluate(() => window.__beat && window.__beat()).catch(() => {});
  }, 100);
  // What's on screen, once a second, for the screen checks (checks.mjs).
  const snaps = ctx ? setInterval(() => ctx.snap(), 1000) : null;
  log(`recording -> ${path}`);
  let wall;
  try { await fn(); } finally {
    await sleep(1200);            // let the final state paint before cutting
    clearInterval(beat);
    if (snaps) clearInterval(snaps);
    await rec.stop();
    wall = (Date.now() - t0) / 1000;
    log(`stopped -> ${path} (wall ${wall.toFixed(1)}s)`);
  }
  return wall;
}
