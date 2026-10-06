/** Time Tracking -> Payroll: hours and gross pay for a period, the Heads up note, Export CSV. */
import { openAdmin, afterNav } from "../admin.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "payroll-summary", seed: ["--timesheets"], viewport: { width: 1600, height: 900 } };

// Sam has a rate; Riley doesn't yet, so the Heads up note shows.
const RATES = `User.find_by!(first_name: "Sam").update!(hourly_rate: 22)`;

export async function setup(ctx) {
  railsRun(RATES);
  await openAdmin(ctx, { path: "/products" });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("why");
  await ctx.pause(1500);

  await ctx.line("open");
  await ctx.click('nav a[href="/admin/time_entries"]', { settle: 500 });
  await afterNav(ctx, { selector: 'main a[href="/admin/time_entries/payroll"]' });
  await ctx.click('main a[href="/admin/time_entries/payroll"]', { settle: 500 });
  await afterNav(ctx, { selector: "main table" });

  await ctx.line("period");
  const two = await page.evaluate(() => {
    const links = [...document.querySelectorAll('main a[href^="/admin/time_entries/payroll?"]:not([href*="csv"])')];
    const a = links[2] || links[links.length - 1];
    a?.setAttribute("data-rec", "period");
    return !!a;
  });
  if (!two) throw new Error("no quick periods");
  await ctx.click('[data-rec="period"]', { settle: 500 });
  await afterNav(ctx, { selector: "main table" });

  await ctx.line("check");
  await ctx.expect(() => page.evaluate(() => /Sam/.test(document.querySelector("main table")?.innerText || "")), "no hours for Sam");
  await ctx.pointAt("main table tbody tr", { settle: 3000 });

  await ctx.line("headsup");
  await ctx.pointAt("main .info-card", { settle: 3000 });

  await ctx.line("export");
  await ctx.pointAt('main a[href^="/admin/time_entries/payroll.csv"]', { settle: 2000 });
  await ctx.finishSpeaking();
}
