/** Owner portal -> Reports: one report for every store, the period, the store picker, the
 *  report buttons, Export CSV. Two stores with a week of sales from the seed. */
import { openAdmin, afterNav } from "../admin.mjs";

export const meta = { id: "owner-reports", seed: ["--second-store"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/owner" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(1200);
  await ctx.click('main a[href="/owner/reports/sales"]', { settle: 500 });
  await afterNav(ctx, { selector: '[data-store-picker-target="button"]' });

  await ctx.line("tabs");
  await ctx.pointAt('main a[href^="/owner/reports/staff_performance"]', { settle: 2500 });

  await ctx.line("period");
  await ctx.click('a.date-preset[href*="period=7d"]', { settle: 500 });
  await afterNav(ctx, { selector: '[data-store-picker-target="button"]' });
  await ctx.pause(1500);

  await ctx.line("stores");
  await ctx.click('[data-store-picker-target="button"]', { settle: 1500 });
  await ctx.pointAt('[data-store-picker-target="dropdown"]', { settle: 1500 });
  await ctx.click('[data-store-picker-target="button"]', { settle: 800 });

  await ctx.line("switch");
  await ctx.click('main a[href^="/owner/reports/staff_performance"]', { settle: 500 });
  await afterNav(ctx);
  await ctx.pause(2500);

  await ctx.line("export");
  await ctx.pointAt('main a[href*="_csv"]', { settle: 2500 });
  await ctx.finishSpeaking();
}
