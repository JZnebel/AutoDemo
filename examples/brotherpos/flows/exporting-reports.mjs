/** Reports -> Sales Report: pick the dates, then the export buttons (PDF, CSV, line items,
 *  Excel), and Status All for voided sales. */
import { openAdmin, afterNav } from "../admin.mjs";

export const meta = { id: "exporting-reports", seed: ["--week-of-sales"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/reports" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.click('main [data-tour="report-sales"]', { settle: 500 });
  await afterNav(ctx, { selector: '[data-tour="date-filter"]' });

  await ctx.line("dates");
  const last = await page.evaluate(() => {
    const presets = [...document.querySelectorAll('[data-tour="date-filter"] a.date-preset')];
    const a = presets[3] || presets[presets.length - 1];
    a?.setAttribute("data-rec", "last-week");
    return !!a;
  });
  if (!last) throw new Error("no date buttons");
  await ctx.click('[data-rec="last-week"]', { settle: 500 });
  await afterNav(ctx, { selector: '[data-tour="date-filter"]' });

  await ctx.line("pdf");
  await ctx.pointAt('main a[href^="/reports/sales_pdf"]', { settle: 2200 });

  await ctx.line("csv");
  await ctx.pointAt('main a[href^="/reports/sales_csv"]', { settle: 1200 });
  await ctx.pointAt('main a[href^="/reports/sales_line_items_csv"]', { settle: 1500 });

  await ctx.line("excel");
  await ctx.pointAt('main a[href^="/reports/sales_xlsx"]', { settle: 2500 });

  await ctx.line("voided");
  await ctx.reveal("select#status");
  await ctx.pointAt("select#status", { settle: 2500 });
  await ctx.finishSpeaking();
}
