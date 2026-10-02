/** Reports -> Sales Report -> Category Performance, after a morning's sales. */
import { openAdmin, afterNav, A } from "../admin.mjs";
import { byText } from "../register.mjs";
import { ringSomeSales } from "./_admin_common.mjs";

export const meta = { id: "category-performance", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) {
  await ringSomeSales(ctx);
  await openAdmin(ctx, { path: "/reports" });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(1500);
  await ctx.click('[data-tour="report-sales"]', { settle: 600 });
  await afterNav(ctx);
  await ctx.click(await byText(page, A("Today"), "a, button", "today"), { settle: 600 });
  await afterNav(ctx, { selector: '[data-tour="category-performance"]' });

  await ctx.line("scroll");
  await ctx.reveal('[data-tour="category-performance"]');
  await page.evaluate(() => document.querySelector('[data-tour="category-performance"]').scrollIntoView({ block: "start" }));
  await ctx.settle();
  await ctx.pointAt('[data-tour="category-performance"] canvas, [data-tour="category-performance"] svg', { settle: 2500 });

  await ctx.line("table");
  await ctx.pointAt('[data-tour="category-performance"] th[data-sort-key="pct"]', { settle: 1500 });

  await ctx.line("sort");
  await ctx.click('[data-tour="category-performance"] th[data-sort-key="items"]', { settle: 2000 });
  await ctx.finishSpeaking();
}
