/** Product -> Pricing: Quality Tier on flower, then simple pricing and a multi-buy deal on
 *  pre-rolls. */
import { openAdmin, goAdmin, afterNav } from "../admin.mjs";
import { productEditPath } from "./_admin_common.mjs";
import { BASE } from "../config.mjs";

export const meta = { id: "pricing-models", seed: [], viewport: { width: 1600, height: 900 } };

let preRoll = null;
export async function setup(ctx) {
  await openAdmin(ctx, { path: "/products" });
  preRoll = await productEditPath(ctx.page, "House Pre-Roll 1g");
  await goAdmin(ctx, await productEditPath(ctx.page, "Pink Kush (AAAA+)"));
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("where");
  await ctx.click('button[data-product-tabs-target="tab"][data-tab="pricing"]', { settle: 900 });

  await ctx.line("tier");
  await ctx.pointAt('#pricing-mode-toggle button[data-pricing-mode="quality_tier"]', { settle: 1200 });
  const tier = await page.evaluate(() => {
    const s = [...document.querySelectorAll('select[name="product[quality_tier]"]')].find((x) => x.getBoundingClientRect().width > 0);
    s?.setAttribute("data-rec", "tier");
    return !!s;
  });
  if (tier) await ctx.pointAt('[data-rec="tier"]', { settle: 1800 });

  await ctx.line("custom");
  await ctx.pointAt('#pricing-mode-toggle button[data-pricing-mode="custom_weight"]', { settle: 2200 });

  await ctx.line("simple");
  await ctx.goto(`${BASE}${preRoll}`);
  await afterNav(ctx, { selector: 'button[data-product-tabs-target="tab"][data-tab="pricing"]' });
  await ctx.click('button[data-product-tabs-target="tab"][data-tab="pricing"]', { settle: 900 });
  await ctx.pointAt('input[name="product[price]"]', { settle: 1500 });

  await ctx.line("bulk");
  const on = 'input[type="checkbox"][name="product[uses_quantity_pricing]"]';
  await ctx.reveal('[data-tour="bulk-pricing"]', { always: true });
  if (!(await page.$eval(on, (e) => e.checked))) await ctx.click(on, { settle: 700 });
  if (!(await page.$('input[name="quantity_pricing_tiers[][quantity]"]'))) await ctx.click('button[data-action="product-edit#addQuantityTier"]', { settle: 600 });
  await page.$$eval('input[name="quantity_pricing_tiers[][quantity]"]', (els) => els[0]?.setAttribute("data-rec", "qty"));
  await page.$$eval('input[name="quantity_pricing_tiers[][price]"]', (els) => els[0]?.setAttribute("data-rec", "total"));
  await page.$eval('[data-rec="qty"]', (e) => { e.value = ""; });
  await ctx.type('[data-rec="qty"]', "5", { delay: 150, settle: 300 });
  await page.$eval('[data-rec="total"]', (e) => { e.value = ""; });
  await ctx.type('[data-rec="total"]', "40", { delay: 150, settle: 500 });

  await ctx.line("save");
  await ctx.click("#product-submit-btn", { settle: 800 });
  await afterNav(ctx);
  await ctx.expect(() => page.evaluate(() => !location.pathname.endsWith("/edit") || !!document.querySelector(".flash, [role='alert']")), "the product didn't save");
  await ctx.pause(1500);
  await ctx.finishSpeaking();
}
