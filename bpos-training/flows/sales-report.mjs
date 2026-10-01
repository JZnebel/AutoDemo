/** Reports -> Sales Report: dates, totals, the breakdowns, export. */
import { openAdmin, afterNav, A } from "../admin.mjs";
import { byText } from "../register.mjs";
import { ringSomeSales } from "./_admin_common.mjs";

export const meta = { id: "sales-report", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

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

  await ctx.line("dates");
  await ctx.pause(500);
  await ctx.click(await byText(page, A("Today"), "a, button", "today"), { settle: 600 });
  await afterNav(ctx);

  await ctx.line("totals");
  await ctx.pause(400);
  await ctx.pointAt(await byText(page, A("Net sales (before tax)"), "p, span, div, h3", "net"), { settle: 1600 }).catch(() => {});

  await ctx.line("more");
  await ctx.pause(400);
  // The section headings, by position (payment methods, then top products): the back office
  // scrolls its main panel, which reveal() handles.
  await page.evaluate(() => [...document.querySelectorAll("main h2, main h3")].forEach((h, i) => h.setAttribute("data-rec", `sec-${i}`)));
  await ctx.reveal('[data-rec="sec-1"]', { block: 0.08 });
  await ctx.pause(1800);
  await ctx.reveal('[data-rec="sec-2"]', { block: 0.08 });
  await ctx.pause(1500);

  await ctx.line("export");
  await ctx.pointAt(await byText(page, A("Export PDF"), "a, button", "pdf"), { settle: 1500 });
  await ctx.finishSpeaking();
}
