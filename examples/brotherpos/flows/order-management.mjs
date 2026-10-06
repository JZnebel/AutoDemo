/** Orders: the list, the search and filters, one order's details and what you can do there. */
import { openAdmin, afterNav } from "../admin.mjs";
import { ringSomeSales } from "./_admin_common.mjs";

export const meta = { id: "order-management", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) {
  await ringSomeSales(ctx);
  await openAdmin(ctx, { path: "/products" });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(1200);
  await ctx.click('nav a[href="/orders"]', { settle: 500 });
  await afterNav(ctx, { selector: '[data-tour="orders-table"]' });
  await ctx.pointAt('[data-tour="orders-table"]', { settle: 1500 });

  await ctx.line("find");
  await ctx.pointAt('[data-tour="filters-section"] input[name="search"]', { settle: 2500 });

  await ctx.line("view");
  const view = await page.evaluate(() => {
    const a = [...document.querySelectorAll('[data-tour="orders-table"] a[href^="/orders/"]')].find((x) => /^\/orders\/\d+$/.test(x.getAttribute("href")) && x.offsetParent);
    a?.setAttribute("data-rec", "view");
    return !!a;
  });
  if (!view) throw new Error("no View link");
  await ctx.click('[data-rec="view"]', { settle: 500 });
  await afterNav(ctx);
  await ctx.pause(3500);

  await ctx.line("actions");
  await ctx.pointAt('main a[href^="/admin/returns/new"]', { settle: 1500 });
  await ctx.click("main details[data-dropdown] > summary", { settle: 2000 });
  await ctx.finishSpeaking();
}
