/**
 * Getting the register (the React POS at /pos) ready to film, and finding things on it.
 * Everything here runs in a flow's setup, before recording starts.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { BASE, CONFIG, creds } from "./config.mjs";
import { log, sleep } from "./recorder.mjs";

/** Open the register in a language, signed in with a PIN, cart empty, catalogue loaded. */
export async function openRegister(ctx, { lang = "en", who = "clerk", signIn = true } = {}) {
  const { page } = ctx;
  // A fresh device every take. seed.mjs rebuilds the store with new ids, and a register
  // that kept the last take's catalogue in IndexedDB adds products the server no longer
  // knows by those ids.
  const cdp = await page.createCDPSession();
  await cdp.send("Storage.clearDataForOrigin", { origin: new URL(BASE).origin, storageTypes: "all" });
  await cdp.detach();
  await page.goto(`${BASE}/pos/`, { waitUntil: "domcontentloaded" });
  // The register's language is a per-device setting kept in localStorage.
  await page.evaluate((l) => localStorage.setItem("pos-locale", l), lang);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.innerText.length > 0, { timeout: 30000 });
  await sleep(1500);

  if (!signIn) {
    // Stop at the PIN pad: the clip films signing in.
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "5"), { timeout: 30000 });
    await ctx.ensureCursor();
    await sleep(1500);
    return;
  }
  if (await page.$('[aria-live="polite"][aria-atomic="true"], [aria-label$="digits entered"]') ||
      await page.evaluate(() => /PIN|NIP/.test(document.body.innerText) && !document.querySelector("[data-product-id]"))) {
    const pin = creds()[`${who}Pin`];
    for (const d of pin) {
      await page.evaluate((digit) => {
        [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === digit)?.click();
      }, d);
      await sleep(180);
    }
    log(`signed in as ${who}`);
  }
  await page.waitForSelector("[data-product-id]", { timeout: 30000 });
  // Clear anything a previous take left in the cart.
  await page.evaluate(() => {
    const clear = [...document.querySelectorAll("button")].find((b) => /^(Clear|Effacer)$/.test(b.innerText.trim()) && b.closest("aside, [class*=cart]"));
    clear?.click();
  });
  await ctx.ensureCursor();
  await ctx.settle();
  await sleep(2500);   // let toasts from signing in fade before the first frame
}

/** A selector for the product card whose name is exactly `name`. */
export async function productCard(page, name) {
  const id = await page.evaluate((n) => {
    const el = [...document.querySelectorAll('[data-tour="product-grid"] [data-product-id]')]
      .find((e) => e.querySelector("h3, p, span, div") && e.innerText.split("\n").some((l) => l.trim() === n));
    return el?.getAttribute("data-product-id");
  }, name);
  if (!id) throw new Error(`no product card "${name}"`);
  return { id, sel: `[data-tour="product-grid"] [data-product-id="${id}"]` };
}

/** Tag the first visible element matching css whose text (whitespace-squashed) is one of
 *  `texts`, and return a selector for it. Lets one flow serve both languages. */
export async function byText(page, texts, css = "button", tag = "t") {
  const want = [].concat(texts);
  const ok = await page.evaluate((c, w, t) => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const el = [...document.querySelectorAll(c)].find((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && w.includes(norm(e.innerText));
    });
    if (!el) return false;
    document.querySelectorAll(`[data-rec="${t}"]`).forEach((x) => x.removeAttribute("data-rec"));
    el.setAttribute("data-rec", t);
    return true;
  }, css, want, tag);
  if (!ok) throw new Error(`not found: ${css} ${JSON.stringify(want)}`);
  return `[data-rec="${tag}"]`;
}

/** Tap a PIN in on the on-screen keypad, with the pointer, for the camera. */
export async function typePin(ctx, pin) {
  for (const d of pin) {
    const sel = await byText(ctx.page, [d], "button", `pin-${d}`);
    await ctx.click(sel, { settle: 220 });
  }
}

/**
 * A register label in every language the clips are made in: L("Complete Sale") gives
 * ["Complete Sale", "Compléter la vente"]. Looked up in the register's own translation
 * files, so a flow names a button once (in English) and finds it in the French take too.
 * Labels shown in capitals (CASH) are matched case-insensitively by byText's callers.
 */
let enToOthers = null;
export function L(en) {
  if (!enToOthers) {
    enToOthers = new Map();
    const dir = join(CONFIG.bposRoot, "web", "src", "i18n", "locales");
    const en_ = JSON.parse(readFileSync(join(dir, "en", "common.json"), "utf8"));
    const fr = JSON.parse(readFileSync(join(dir, "fr", "common.json"), "utf8"));
    const walk = (a, b) => {
      for (const [k, v] of Object.entries(a)) {
        if (typeof v === "string" && typeof b?.[k] === "string") {
          const key = v.trim();
          if (!enToOthers.has(key)) enToOthers.set(key, new Set());
          enToOthers.get(key).add(b[k].trim());
        } else if (v && typeof v === "object") walk(v, b?.[k]);
      }
    };
    walk(en_, fr);
  }
  const others = enToOthers.get(en);
  if (!others) throw new Error(`L(): no translation found for "${en}"`);
  return [en, ...others];
}

/** Off camera (setup only): put products in the cart by name. A weighed product takes the
 *  first weight in its picker. */
export async function addToCart(page, names) {
  for (const name of names) {
    const { sel } = await productCard(page, name);
    await page.click(sel);
    await sleep(900);
    const picked = await page.evaluate(() => {
      const b = document.querySelector('[data-tour="weight-modal-backdrop"] button.weight-preset-btn');
      if (b) { b.click(); return true; }
      return false;
    });
    if (picked) await sleep(800);
  }
  await sleep(600);
}

/** Off camera (setup only): ring a whole cash sale through the register, so a clip about
 *  returns or voids has a sale to work on. */
export async function quickSale(ctx, names, { pay = "cash" } = {}) {
  const { page } = ctx;
  await addToCart(page, names);
  const tap = async (texts) => {
    const ok = await page.evaluate((w) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const b = [...document.querySelectorAll("button")].filter((e) => w.includes(norm(e.innerText))).pop();
      b?.click();
      return !!b;
    }, texts);
    if (!ok) throw new Error(`quickSale: no button ${JSON.stringify(texts)}`);
    await sleep(1000);
  };
  if (pay === "card") {
    await page.click('[data-tour="tender-card"]');
    await sleep(1000);
  } else {
    await page.click('[data-tour="tender-cash"]');
    await sleep(1000);
    await tap(L("Exact"));
  }
  await tap(L("Complete Sale"));
  await sleep(1500);
  await tap(L("Start New Sale"));
  await sleep(1200);
}

/** Tag the innermost visible element whose own text starts with one of `texts` (store data
 *  such as a customer or reward name), and return a selector for it. */
export async function byTextStart(page, texts, css = "*", tag = "ts") {
  const want = [].concat(texts);
  const ok = await page.evaluate((c, w, t) => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const hits = [...document.querySelectorAll(c)].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && w.some((x) => norm(e.innerText).startsWith(x));
    });
    const el = hits.pop();
    if (!el) return false;
    document.querySelectorAll(`[data-rec="${t}"]`).forEach((x) => x.removeAttribute("data-rec"));
    el.setAttribute("data-rec", t);
    return true;
  }, css, want, tag);
  if (!ok) throw new Error(`not found: ${css} starting ${JSON.stringify(want)}`);
  return `[data-rec="${tag}"]`;
}

/** The most recent sale in the Recent Sales list. */
export async function latestSaleRow(page) {
  const ok = await page.evaluate(() => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const rows = [...document.querySelectorAll('[data-tour="cart-pane"] div')].filter((e) => /^#\d+/.test(norm(e.innerText)));
    // Innermost row wrapping the first (newest) receipt number.
    const first = rows.filter((e) => norm(e.innerText).startsWith(norm(rows[0]?.innerText).split(" ")[0]));
    const el = first.pop();
    if (!el) return false;
    el.setAttribute("data-rec", "sale-row");
    return true;
  });
  if (!ok) throw new Error("no sale in Recent Sales");
  return '[data-rec="sale-row"]';
}

/** Of the visible buttons labelled one of `texts`, the one actually on top at its own
 *  centre — the button in an open window, not the identically-labelled one behind it (a
 *  click there lands on the window's backdrop and closes it). */
export async function topmost(page, texts, tag, css = "button") {
  const ok = await page.evaluate((w, t, c) => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const hits = [...document.querySelectorAll(c)].filter((e) => {
      if (!w.includes(norm(e.innerText))) return false;
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const x = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1);
      const y = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1);
      const at = document.elementFromPoint(x, y);
      // Off screen, or scrolled out of its own scrolling box, counts as on top: reveal()
      // scrolls it in before it's clicked.
      if (r.bottom < 0 || r.top > innerHeight) return true;
      for (let p = e.parentElement; p; p = p.parentElement) {
        if (p.scrollHeight > p.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(p).overflowY)) {
          const pr = p.getBoundingClientRect();
          if (r.top < pr.top || r.bottom > pr.bottom) return true;
          break;
        }
      }
      return at && (e === at || e.contains(at));
    });
    const el = hits.pop();
    if (!el) return false;
    document.querySelectorAll(`[data-rec="${t}"]`).forEach((x) => x.removeAttribute("data-rec"));
    el.setAttribute("data-rec", t);
    return true;
  }, [].concat(texts), tag, css);
  if (!ok) throw new Error(`no topmost ${css} ${JSON.stringify(texts)}`);
  return `[data-rec="${tag}"]`;
}

/** A control on one cart line: the line is the smallest box in the cart that holds both
 *  the product's name and a Remove button. */
export async function cartLineControl(page, name, css, tag) {
  const ok = await page.evaluate((n, c, t) => {
    const cart = document.querySelector('[data-tour="cart-pane"]') || document.body;
    const lines = [...cart.querySelectorAll("div")].filter((d) =>
      d.querySelector('[data-tour="remove-item"]') && d.innerText.split("\n").some((l) => l.trim() === n));
    const line = lines.sort((a, b) => a.querySelectorAll("*").length - b.querySelectorAll("*").length)[0];
    const el = line && [...line.querySelectorAll(c)].find((e) => e.getBoundingClientRect().width > 0);
    if (!el) return false;
    document.querySelectorAll(`[data-rec="${t}"]`).forEach((x) => x.removeAttribute("data-rec"));
    el.setAttribute("data-rec", t);
    return true;
  }, name, css, tag);
  if (!ok) throw new Error(`no ${css} on the cart line "${name}"`);
  return `[data-rec="${tag}"]`;
}
