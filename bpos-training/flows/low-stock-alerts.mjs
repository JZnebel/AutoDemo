/** Set Glass Hand Pipe's Low Stock Alert above its 14 in stock, then find it on the
 *  Inventory report's Low Stock Warning. */
import { openAdmin, goAdmin, afterNav } from "../admin.mjs";
import { productEditPath } from "./_admin_common.mjs";

export const meta = { id: "low-stock-alerts", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) {
  await openAdmin(ctx, { path: "/products" });
  await goAdmin(ctx, await productEditPath(ctx.page, "Glass Hand Pipe"));
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("intro");
  await ctx.pause(2000);
  await ctx.click('[role="tab"][data-tab="inventory"]', { settle: 1000 });

  await ctx.line("level");
  await ctx.type("#product-edit-form #product_low_stock_threshold", "20", { delay: 200, settle: 600 });

  await ctx.line("save");
  const save = await page.evaluate(() => {
    const b = [...document.querySelectorAll('#product-edit-form [type="submit"]')].filter((x) => x.getBoundingClientRect().width > 0).pop();
    b?.setAttribute("data-rec", "save");
    return !!b;
  });
  if (!save) throw new Error("no save button");
  await ctx.click('[data-rec="save"]', { settle: 600 });
  await afterNav(ctx);
  await ctx.pause(800);

  await ctx.line("report");
  await ctx.click('nav a[href="/reports"]', { settle: 500 });
  await afterNav(ctx, { selector: '[data-tour="report-inventory"]' });
  await ctx.click('[data-tour="report-inventory"]', { settle: 500 });
  await afterNav(ctx, { selector: '[data-tour="low-stock-products"]' });
  const card = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[data-tour="inventory-summary-cards"] .dashboard-card')].find((c) => c.querySelector(".text-yellow-500"));
    el?.setAttribute("data-rec", "low-card");
    return !!el && /[1-9]/.test(el.innerText);
  });
  if (!card) throw new Error("no low stock count");
  await ctx.pointAt('[data-rec="low-card"]', { settle: 1800 });

  await ctx.line("list");
  await page.evaluate(() => document.querySelector('[data-tour="low-stock-products"]').scrollIntoView({ block: "center" }));
  await ctx.pointAt('[data-tour="low-stock-products"]', { settle: 2000 });
  await ctx.finishSpeaking();
}
