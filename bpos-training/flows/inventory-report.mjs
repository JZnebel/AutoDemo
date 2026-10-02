/** Reports -> Inventory: the Stock, Movement and Turnover tabs, after a morning's sales. */
import { openAdmin, goAdmin, afterNav } from "../admin.mjs";
import { ringSomeSales } from "./_admin_common.mjs";

export const meta = { id: "inventory-report", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) {
  await ringSomeSales(ctx);
  await openAdmin(ctx, { path: "/reports" });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(1600);
  await ctx.click('[data-tour="report-inventory"]', { settle: 500 });
  await afterNav(ctx, { selector: '[data-tour="inventory-summary-cards"]' });

  await ctx.line("value");
  await ctx.pointAt('[data-tour="inventory-summary-cards"] .dashboard-card', { settle: 2500 });

  await ctx.line("low");
  await page.evaluate(() => document.querySelector('[data-tour="low-stock-products"]')?.scrollIntoView({ block: "center" }));
  await ctx.pointAt('[data-tour="low-stock-products"]', { settle: 1800 });
  await page.evaluate(() => window.scrollTo(0, 0));

  await ctx.line("movement");
  await ctx.click('[data-test="report-tabs"] a[data-tab="movement"]', { settle: 500 });
  await afterNav(ctx);
  await ctx.pause(2500);

  await ctx.line("turnover");
  if (await page.$('[data-test="report-tabs"] a[data-tab="turnover"]')) {
    await ctx.click('[data-test="report-tabs"] a[data-tab="turnover"]', { settle: 500 });
    await afterNav(ctx);
  }
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}
