/** Owner portal -> Stock Transfers -> New Transfer: 5 pipes from Riverstone to Westside. */
import { openAdmin, afterNav } from "../admin.mjs";

export const meta = { id: "moving-stock-between-stores", seed: ["--second-store"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/owner" }); }

async function optionByText(page, selectSel, re) {
  return page.evaluate((s, src) => {
    const o = [...document.querySelector(s).options].find((x) => new RegExp(src).test(x.text));
    return o ? o.value : null;
  }, selectSel, re.source);
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(2500);
  await ctx.click('a[href="/owner/stock_transfers"]', { settle: 500 });
  await afterNav(ctx, { selector: 'a[href="/owner/stock_transfers/new"]' });
  await ctx.click('a[href="/owner/stock_transfers/new"]', { settle: 500 });
  await afterNav(ctx, { selector: "#source_store_select" });

  await ctx.line("stores");
  const from = await optionByText(page, "#source_store_select", /^Riverstone Cannabis$/);
  const to = await optionByText(page, "#stock_transfer_destination_store_id", /Westside/);
  if (!from || !to) throw new Error("the two stores aren't offered");
  await ctx.select("#source_store_select", from, { settle: 1200 });
  await ctx.select("#stock_transfer_destination_store_id", to, { settle: 1800 });
  await page.waitForSelector('button[data-action="stock-transfer-form#pickTile"]', { timeout: 15000 });

  await ctx.line("product");
  const tile = await page.evaluate(() => {
    const t = [...document.querySelectorAll('button[data-action="stock-transfer-form#pickTile"]')].find((b) => /Glass Hand Pipe/.test(b.innerText));
    t?.setAttribute("data-rec", "pipe");
    return !!t;
  });
  if (!tile) throw new Error("no Glass Hand Pipe tile");
  await ctx.click('[data-rec="pipe"]', { settle: 900 });
  const qty = '[data-stock-transfer-form-target="lines"] input[name$="[quantity]"]';
  await page.waitForSelector(qty, { timeout: 8000 });
  await page.$eval(qty, (i) => { i.value = ""; });
  await ctx.type(qty, "5", { delay: 200, settle: 900 });

  await ctx.line("send");
  await ctx.click('[data-stock-transfer-form-target="submit"]', { settle: 1200 });
  await page.waitForSelector("#confirmation-modal-confirm-btn", { visible: true, timeout: 8000 });
  await ctx.click("#confirmation-modal-confirm-btn", { settle: 600 });
  await afterNav(ctx);

  await ctx.line("done");
  const ok = await page.evaluate(() => /Glass Hand Pipe/.test(document.querySelector("main")?.innerText || "") && !/\/new$/.test(location.pathname));
  if (!ok) throw new Error(`the transfer didn't go through (now on ${page.url()})`);
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}
