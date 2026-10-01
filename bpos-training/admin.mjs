/**
 * Getting the back office (the Rails admin) ready to film, and finding things on it.
 * Everything here runs in a flow's setup, before recording starts, except the A() lookup.
 */
import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { BASE, CONFIG, creds } from "./config.mjs";
import { log, sleep } from "./recorder.mjs";

const here = dirname(fileURLToPath(import.meta.url));

/** Sign in to the back office as the owner (or manager) and open `path`. The language is
 *  the store's, set by seed.mjs --lang. */
export async function openAdmin(ctx, { who = "owner", path = "/products" } = {}) {
  const { page } = ctx;
  const cdp = await page.createCDPSession();
  await cdp.send("Storage.clearDataForOrigin", { origin: new URL(BASE).origin, storageTypes: "all" });
  await cdp.send("Network.clearBrowserCookies");
  await cdp.detach();
  await page.goto(`${BASE}/users/sign_in`, { waitUntil: "domcontentloaded" });
  const c = creds();
  await page.waitForSelector('input[type="password"]', { timeout: 20000 });
  await page.$eval('input[type="email"], input[name="user[email]"]', (e, v) => { e.value = v; }, `${who}@${CONFIG.subdomain}.training`);
  await page.$eval('input[type="password"]', (e, v) => { e.value = v; }, c.password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
    page.$eval('form [type="submit"]', (b) => b.click()),
  ]);
  log(`admin: signed in as ${who}, now ${page.url()}`);
  await goAdmin(ctx, path);
}

/** Load a back-office page (off camera) and wait for it to settle. */
export async function goAdmin(ctx, path) {
  const { page } = ctx;
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.addStyleTag({ content: "*{scroll-behavior:auto !important}" });
  await ctx.ensureCursor();
  await ctx.settle();
  // Flash messages ("Signed in successfully") would sit over the first seconds of the clip.
  await page.evaluate(() => document.querySelectorAll('[data-controller~="flash"], .flash, [role="alert"]').forEach((e) => e.remove()));
  await sleep(1200);
}

/** After a click that navigates (Turbo or a full load), wait for the new page to settle. */
export async function afterNav(ctx, { selector = null, timeout = 20000 } = {}) {
  const { page } = ctx;
  if (selector) await page.waitForSelector(selector, { timeout });
  else await sleep(1500);
  await page.addStyleTag({ content: "*{scroll-behavior:auto !important}" }).catch(() => {});
  await ctx.ensureCursor();
  await ctx.settle();
}

/**
 * A back-office label in English and French: A("Next") gives ["Next", "Suivant"]. Built
 * from the Rails locale files by admin-labels.py (cached in .local/).
 */
let map = null;
export function A(en) {
  if (!map) {
    const p = join(here, ".local", "admin-labels.json");
    if (!existsSync(p)) execFileSync("python3", [join(here, "admin-labels.py"), CONFIG.bposRoot], { stdio: "inherit" });
    map = JSON.parse(readFileSync(p, "utf8"));
  }
  const fr = map[en];
  if (!fr) throw new Error(`A(): no translation found for "${en}"`);
  return [en, ...fr];
}

/** Tag the label (for a hidden radio/checkbox) whose text starts with one of `texts`. */
export async function labelFor(page, texts, tag) {
  const ok = await page.evaluate((w, t) => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
    const want = w.map((x) => x.toLowerCase());
    const el = [...document.querySelectorAll("label")].filter((l) => {
      const r = l.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && want.some((x) => norm(l.innerText).startsWith(x));
    }).pop();
    if (!el) return false;
    el.setAttribute("data-rec", t);
    return true;
  }, [].concat(texts), tag);
  if (!ok) throw new Error(`no label starting ${JSON.stringify(texts)}`);
  return `[data-rec="${tag}"]`;
}
