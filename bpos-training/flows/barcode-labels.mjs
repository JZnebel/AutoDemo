/** Products -> More Actions -> Print Barcode Labels: a sheet of Avery labels from the back
 *  office. The print window is the computer's own, so the clip stops at the Print button. */
import { openAdmin, afterNav } from "../admin.mjs";

export const meta = { id: "barcode-labels", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

const SEARCH = '[data-barcode-labels-target="search"]';
async function add(ctx, query, label, tag) {
  const { page } = ctx;
  await ctx.type(SEARCH, query, { delay: 120, settle: 200 });
  // The back office's scanner listener can take the last keystrokes without an input event,
  // so the search never sees the whole word; fire the one the box would have.
  await page.$eval(SEARCH, (e) => e.dispatchEvent(new Event("input", { bubbles: true })));
  await page.waitForFunction((l) => [...document.querySelectorAll('[data-barcode-labels-target="results"] > div')].some((r) => r.innerText.includes(l)), { timeout: 10000 }, label).catch(() => {});
  // The typed search and the fired input event can each come back and redraw the list,
  // dropping the mark; let it settle and mark again until the click lands.
  for (let attempt = 0; ; attempt++) {
    await ctx.pause(attempt ? 1200 : 400);
    const ok = await page.evaluate((l, t) => {
      const row = [...document.querySelectorAll('[data-barcode-labels-target="results"] > div')].find((r) => r.innerText.includes(l));
      row?.querySelector("button")?.setAttribute("data-rec", t);
      return !!row?.querySelector("button");
    }, label, tag);
    if (!ok) { if (attempt < 5) continue; throw new Error(`no result for ${label}`); }
    try { await ctx.click(`[data-rec="${tag}"]`, { settle: 900 }); return; } catch (e) { if (attempt >= 5) throw e; }
  }
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(2200);
  await ctx.click('[data-tour="more-actions"] summary', { settle: 900 });
  await ctx.click('[data-tour="more-actions"] a[href="/barcode_labels"]', { settle: 500 });
  await afterNav(ctx, { selector: SEARCH });
  // Typing before the page script has connected goes nowhere.
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-controller~="barcode-labels"]');
    return !!(window.Stimulus && el && window.Stimulus.getControllerForElementAndIdentifier(el, "barcode-labels"));
  }, { timeout: 15000 });

  await ctx.line("sheet");
  await ctx.select('[data-barcode-labels-target="template"]', "5160", { settle: 1500 });

  await ctx.line("add");
  await add(ctx, "Mango", "Mango Gummies", "a1");
  await add(ctx, "Glass", "Glass Hand Pipe", "a2");

  await ctx.line("copies");
  const qty = await page.evaluate(() => {
    const q = document.querySelector('[data-barcode-labels-target="selected"] input[type="number"]');
    q?.setAttribute("data-rec", "qty1");
    return !!q;
  });
  if (!qty) throw new Error("nothing in Selected");
  await ctx.type('[data-rec="qty1"]', "10", { delay: 200, settle: 1200 });

  await ctx.line("preview");
  await page.evaluate(() => document.querySelector("#label-sheet")?.scrollIntoView({ block: "start" }));
  await ctx.settle();
  await ctx.pause(2500);

  await ctx.line("print");
  await page.evaluate(() => window.scrollTo(0, 0));
  await ctx.settle();
  await ctx.pointAt('button[data-action="barcode-labels#print"]', { settle: 2500 });
  await ctx.finishSpeaking();
}
