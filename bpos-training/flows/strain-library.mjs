/** Products -> More Actions -> Strain Library: find Blue Dream, make an AAA flower from it,
 *  with its description, effects and terpene filled in. */
import { openAdmin, afterNav } from "../admin.mjs";

export const meta = { id: "strain-library", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(2200);
  await ctx.click('[data-tour="more-actions"] summary', { settle: 900 });
  await ctx.click('[data-tour="more-actions"] a[href="/cannabis_strains"]', { settle: 500 });
  await afterNav(ctx, { selector: '[data-strain-library-target="searchInput"]' });

  await ctx.line("browse");
  await ctx.pause(2500);

  await ctx.line("search");
  await ctx.type('[data-strain-library-target="searchInput"]', "Blue Dream", { delay: 130, settle: 1800 });
  await page.waitForSelector('button[data-strain-name="Blue Dream"]', { visible: true, timeout: 10000 });
  await ctx.click('button[data-strain-name="Blue Dream"]', { settle: 1500 });

  await ctx.line("kind");
  await page.waitForSelector('input[name="product_name"]', { visible: true, timeout: 10000 });
  await ctx.click('label:has(input[name="product_type"][value="weight"])', { settle: 600 });
  await ctx.type('input[name="product_name"]', "Blue Dream", { delay: 110, settle: 500 });
  const tier = await page.evaluate(() => {
    const r = [...document.querySelectorAll('input[name="quality_tier_id"]')].find((x) => x.dataset.tierName === "AAA");
    const l = r?.closest("label");
    l?.setAttribute("data-rec", "tier");
    return !!l;
  });
  if (!tier) throw new Error("no AAA tier choice");
  await ctx.click('[data-rec="tier"]', { settle: 800 });
  await ctx.type('input[name="stock_grams"]', "100", { delay: 180, settle: 600 });

  await ctx.line("create");
  await page.$eval('input[name="batch_mode"]', (c) => { if (c.checked) c.click(); });
  await ctx.click('form[action="/admin/quick_add"] button[type="submit"]', { settle: 800 });
  await afterNav(ctx);
  const made = await page.evaluate(async () => /Blue Dream/.test(await (await fetch("/products?search=Blue+Dream", { headers: { Accept: "text/html" } })).text()));
  if (!made) throw new Error("no Blue Dream product");
  await ctx.pause(1500);

  await ctx.line("existing");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}
