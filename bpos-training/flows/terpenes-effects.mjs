/** Cannabis tab -> Cannabis Profile: tag Pink Kush with terpenes and effects, then the shared
 *  Terpenes list through the admin search. */
import { openAdmin, goAdmin, afterNav } from "../admin.mjs";
import { productEditPath } from "./_admin_common.mjs";

export const meta = { id: "terpenes-effects", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) {
  await openAdmin(ctx, { path: "/products" });
  await goAdmin(ctx, await productEditPath(ctx.page, "Pink Kush (AAAA+)"));
}

/** Tick the Cannabis Profile box for `name` in the `field` list (terpene_ids, effect_ids, ...). */
async function tick(ctx, field, name, tag) {
  const ok = await ctx.page.evaluate((f, n, t) => {
    const box = [...document.querySelectorAll(`input[name="product[${f}][]"]`)]
      .find((i) => (i.closest("label")?.textContent || "").replace(/^[^\p{L}]+/u, "").startsWith(n));
    box?.setAttribute("data-rec", t);
    return !!box;
  }, field, name, tag);
  if (!ok) throw new Error(`no ${field} box for ${name}`);
  await ctx.reveal(`[data-rec="${tag}"]`);
  await ctx.click(`[data-rec="${tag}"]`, { settle: 350 });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("why");
  await ctx.pause(1500);

  await ctx.line("open");
  await ctx.click('button[data-product-tabs-target="tab"][data-tab="cannabis"]', { settle: 800 });
  await ctx.reveal('input[name="product[terpene_ids][]"]', { always: true });

  await ctx.line("tick");
  await tick(ctx, "terpene_ids", "Myrcene", "t1");
  await tick(ctx, "terpene_ids", "Caryophyllene", "t2");
  await tick(ctx, "effect_ids", "Relaxed", "e1");
  await tick(ctx, "effect_ids", "Sleepy", "e2");
  await ctx.click("#product-submit-btn", { settle: 800 });
  await ctx.expect(() => page.evaluate(() => !document.querySelector("#product-submit-btn") || !!document.querySelector(".flash, [role='alert'], [data-controller~='toast']")),
    "the product didn't save");
  await afterNav(ctx);

  await ctx.line("lists");
  const search = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button[data-action*="global-search#open"]')].find((x) => x.getBoundingClientRect().width > 0);
    b?.setAttribute("data-rec", "search");
    return !!b;
  });
  if (!search) throw new Error("no search button");
  await ctx.click('[data-rec="search"]', { settle: 500 });
  await ctx.type('[data-global-search-target="input"]', "Terp", { delay: 140, settle: 800 });
  await ctx.click('[data-global-search-target="pageResults"] a[href="/admin/terpenes"]', { settle: 500 });
  await afterNav(ctx, { selector: "main table" });
  await ctx.expect(() => page.evaluate(() => /Myrcene/.test(document.querySelector("main table")?.innerText || "")), "no terpene list");
  await ctx.pointAt("main table tbody tr", { settle: 1500 });

  await ctx.line("shared");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}
