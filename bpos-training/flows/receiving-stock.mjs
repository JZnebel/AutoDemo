/** Checking a delivery in on the product's Inventory tab. */
import { openAdmin, goAdmin, afterNav } from "../admin.mjs";
import { productEditPath } from "./_admin_common.mjs";

export const meta = { id: "receiving-stock", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) {
  await openAdmin(ctx, { path: "/products" });
  await goAdmin(ctx, await productEditPath(ctx.page, "Mango Gummies 10mg x 10"));
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("tab");
  await ctx.pause(2500);
  await ctx.click('[role="tab"][data-tab="inventory"]', { settle: 1200 });

  await ctx.line("fill");
  await ctx.pause(800);
  await ctx.type('form[action$="/check_in"] [name="quantity"]', "24", { delay: 180, settle: 500 });
  await ctx.type('form[action$="/check_in"] [name="unit_cost"]', "8.50", { delay: 150, settle: 500 });
  await ctx.type('form[action$="/check_in"] [name="notes"]', "Weekly order", { delay: 70, settle: 500 });

  await ctx.line("submit");
  await ctx.click('form[action$="/check_in"] [type="submit"]', { settle: 600 });
  await afterNav(ctx);
  await page.evaluate(() => document.querySelector('[role="tab"][data-tab="inventory"]')?.click());
  await ctx.pause(800);
  await ctx.reveal('form[action$="/check_in"]', { block: 0.15 }).catch(() => {});
  await ctx.pause(1500);
  await ctx.finishSpeaking();
}
