/** Settings -> Edit Settings -> Notifications -> Scheduled Report Digests: on, weekly, who to,
 *  when, Update Settings. */
import { openAdmin } from "../admin.mjs";
import { openEditSettings, updateSettings } from "./_settings_common.mjs";

export const meta = { id: "report-digest", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("why");
  await ctx.pause(1500);

  await ctx.line("open");
  await openEditSettings(ctx);
  await ctx.click('button.settings-tab[data-tab="notifications"]', { settle: 800 });

  await ctx.line("on");
  const box = 'input[type="checkbox"][name="store[enable_report_digest]"]';
  await ctx.reveal(box, { always: true });
  if (!(await page.$eval(box, (e) => e.checked))) await ctx.click(box, { settle: 500 });
  await ctx.select('select[name="store[report_digest_frequency]"]', "weekly", { settle: 600 });

  await ctx.line("who");
  await page.$eval('input[name="store[report_digest_emails]"]', (e) => { e.value = ""; });
  await ctx.type('input[name="store[report_digest_emails]"]', "owner@riverstone.training, manager@riverstone.training", { delay: 45, settle: 400 });
  await ctx.setTime('input[name="store[report_digest_time]"]', "07:00 AM", { settle: 600 });

  await ctx.line("save");
  await updateSettings(ctx);
  await ctx.expect(() => page.evaluate(() => location.pathname === "/store_settings"), "settings didn't save");
  await ctx.pause(1500);
  await ctx.finishSpeaking();
}
