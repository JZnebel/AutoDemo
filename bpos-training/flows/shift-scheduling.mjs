/** Time Tracking -> More Actions -> Shift Schedule: the week, add a shift, copy and share it. */
import { openAdmin, afterNav } from "../admin.mjs";

export const meta = { id: "shift-scheduling", seed: ["--shifts"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.click('nav a[href="/admin/time_entries"]', { settle: 500 });
  await afterNav(ctx, { selector: 'details[data-tour="export-csv"] > summary' });
  await ctx.click('details[data-tour="export-csv"] > summary', { settle: 700 });
  await ctx.click('details[data-tour="export-csv"] a[href="/admin/shifts"]', { settle: 500 });
  await afterNav(ctx, { selector: "main table" });

  await ctx.line("grid");
  await ctx.pointAt("main table tbody tr", { settle: 2500 });

  await ctx.line("add");
  // Sam's first empty day this week.
  const add = await page.evaluate(() => {
    const row = [...document.querySelectorAll("main table tbody tr")].find((r) => /Sam/.test(r.innerText));
    const b = row && [...row.querySelectorAll('button[onclick^="addShift("]')][0];
    b?.setAttribute("data-rec", "add");
    return !!b;
  });
  if (!add) throw new Error("no empty day for Sam");
  await ctx.click('[data-rec="add"]', { settle: 800 });
  await ctx.setTime("#shiftStartTime", "12:00 PM", { settle: 400 });
  await ctx.setTime("#shiftEndTime", "08:00 PM", { settle: 400 });
  await ctx.select("#shiftRole", "closer", { settle: 500 });
  const before = await page.$$eval("main table [data-user-id]", (els) => els.length);
  await ctx.click("#shiftSubmitBtn", { settle: 800 });
  await ctx.expect(() => page.$$eval("main table [data-user-id]", (els, n) => els.length > n, before), "the shift wasn't added");

  await ctx.line("totals");
  await ctx.pause(2500);

  await ctx.line("copy");
  await ctx.pointAt('form[action^="/admin/shifts/copy_week"] button, form[action^="/admin/shifts/copy_week"] [type="submit"]', { settle: 2000 });

  await ctx.line("share");
  await ctx.pointAt('main a[href^="/admin/shifts/print"]', { settle: 1200 });
  await ctx.pointAt('form[action^="/admin/shifts/email_schedule"]:not([action*="user_id"]) [type="submit"], form[action^="/admin/shifts/email_schedule"]:not([action*="user_id"]) button', { settle: 1500 });
  await ctx.finishSpeaking();
}
