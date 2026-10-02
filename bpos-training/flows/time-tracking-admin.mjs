/** Time Tracking in the back office: the timesheet, fixing a forgotten clock-out, Payroll. */
import { openAdmin, afterNav } from "../admin.mjs";

export const meta = { id: "time-tracking-admin", seed: ["--timesheets"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(1200);
  await ctx.click('nav a[href="/admin/time_entries"]', { settle: 500 });
  await afterNav(ctx, { selector: '[data-tour="stats"]' });
  await ctx.pointAt('[data-tour="stats"]', { settle: 2000 });

  await ctx.line("forgot");
  // Newest first, so Riley's first row is yesterday's clock-in with no clock-out.
  const view = await page.evaluate(() => {
    const row = [...document.querySelectorAll("tr[data-sort-employee]")].find((r) => /Riley/.test(r.dataset.sortEmployee));
    const a = row?.querySelector('a[href^="/admin/time_entries/"]');
    row?.setAttribute("data-rec", "riley-row");
    a?.setAttribute("data-rec", "view");
    return !!a;
  });
  if (!view) throw new Error("no Riley time entry");
  await ctx.pointAt('[data-rec="riley-row"]', { settle: 1500 });
  await ctx.click('[data-rec="view"]', { settle: 500 });
  await afterNav(ctx, { selector: 'main a[href$="/edit"]' });
  await ctx.click('main a[href$="/edit"]', { settle: 500 });
  await afterNav(ctx, { selector: "#time_entry_clock_out_at" });

  await ctx.line("fix");
  const out = await page.$eval("#time_entry_clock_in_at", (e) => e.value.replace(/T\d\d:\d\d$/, "T17:00"));
  await ctx.pointAt("#time_entry_clock_out_at", { settle: 600 });
  await page.$eval("#time_entry_clock_out_at", (e, v) => {
    e.value = v;
    e.dispatchEvent(new Event("input", { bubbles: true }));
    e.dispatchEvent(new Event("change", { bubbles: true }));
  }, out);
  await ctx.pause(1200);

  await ctx.line("save");
  await ctx.click('form input[type="submit"][name="commit"]', { settle: 500 });
  await afterNav(ctx);
  if (await page.$("#time_entry_clock_out_at")) throw new Error("the time card form came back with an error");
  await ctx.pause(1500);

  await ctx.line("payroll");
  await ctx.click('nav a[href="/admin/time_entries"]', { settle: 500 });
  await afterNav(ctx, { selector: 'main a[href="/admin/time_entries/payroll"]' });
  await ctx.click('main a[href="/admin/time_entries/payroll"]', { settle: 500 });
  await afterNav(ctx);
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}
