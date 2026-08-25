import { BASE } from "./recorder.mjs";
import { STORE_ID } from "./config.mjs";
/**
 * Bringing an existing menu across — the universal product importer.
 *
 * A companion to flow-02, not a replacement: that clip adds one product by hand,
 * which is what a shop with no menu yet does. This is the shop that already has
 * one somewhere else and does not want to retype it.
 *
 * Shot against a DEV server: the importer fix (price_unit mapping) is in source,
 * and :3000 is a production build that predates it. Pass REZ_BASE.
 *
 * The mapping is one OpenAI call and it is not instant. That wait is real and the
 * clip keeps it rather than cutting to a finished screen — an owner who expects
 * it to be instant and sees a spinner assumes it has hung.
 */

import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures", "pos-export.csv");

export const meta = {
  name: "06-import",
  title: "Bring your menu across from your POS",
  url: `${BASE}/admin/stores/${STORE_ID}/menu`,
  viewport: { width: 1280, height: 720 },
};

const byText = (page, text, name, css = "button") =>
  page.evaluate((c, t, n) => {
    const el = [...document.querySelectorAll(c)].find((e) => (e.innerText || "").replace(/\s+/g, " ").trim() === t);
    if (!el) return false;
    el.setAttribute("data-rec", n);
    return true;
  }, css, text, name).then((ok) => {
    if (!ok) throw new Error(`not found: ${css} "${text}"`);
    return `[data-rec="${name}"]`;
  });

export async function setup(ctx) {
  const { page } = ctx;
  const { signIn } = await import("./signin.mjs");
  await signIn(ctx);
  await ctx.goto(meta.url);
  await page.addStyleTag({ content: "*{scroll-behavior:auto !important}" });
  await ctx.settle();
  await page.evaluate(() => window.scrollTo(0, 0));
  await ctx.pause(1200);
}

export async function run(ctx) {
  const { page } = ctx;

  await ctx.pause(2000);                        // an empty menu

  await ctx.clickDom(await byText(page, "Paste a menu", "paste"), { settle: 1600 });
  await ctx.waitForText("Add your menu");
  await ctx.pause(1400);                        // three ways in: text, photo, export

  await ctx.clickDom(await byText(page, "Upload export", "tab"), { settle: 1300 });
  await ctx.pause(1200);                        // "any POS… AI figures out the columns"

  await ctx.upload(await byText(page, "Choose a file", "choose"),
    'input[type="file"][accept*=".csv"]', FIXTURE, { settle: 1600 });

  const t0 = Date.now();
  await ctx.clickDom(await byText(page, "Import products", "go"), { settle: 500 });
  await ctx.waitForText("What should go on your menu?", 90000);
  ctx.note(`mapping took ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await ctx.pause(3200);                        // the columns it worked out, and the sections

  // Drop the sundries. This is the half an owner cares about: their POS carries
  // lighters and a gift card, and none of that belongs on a cannabis menu.
  for (const section of ["SUNDRY", "MISC", "DRINKS"]) {
    const sel = await page.evaluate((label) => {
      const row = [...document.querySelectorAll("label")]
        .find((l) => new RegExp(`^\\s*${label}\\b`).test(l.innerText || ""));
      if (!row) return null;
      row.setAttribute("data-rec", `sec-${label}`);
      return `[data-rec="sec-${label}"]`;
    }, section);
    if (sel) await ctx.clickDom(sel, { settle: 800 });
    else ctx.note(`section ${section} not present`);
  }
  await ctx.pause(1600);                        // the count comes down

  await ctx.clickDom(await byText(page, "Review products", "review"), { settle: 2600 });
  await ctx.pause(2600);                        // every row, priced and sized

  const add = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /^Add \d+ products?$/i.test(x.innerText.trim()));
    if (!b) return null;
    b.setAttribute("data-rec", "add");
    return '[data-rec="add"]';
  });
  if (!add) throw new Error("no confirm button on the review step");
  await ctx.clickDom(add, { settle: 3000 });

  await ctx.waitForText("Blue Heron OG", 30000);
  await ctx.settle();
  await ctx.pause(3400);                        // the menu, populated
}
