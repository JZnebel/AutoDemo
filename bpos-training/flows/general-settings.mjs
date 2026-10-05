/** Settings -> General (store details, time zone, hours) and Operations (opening float, payment
 *  types), one Update Settings for both. */
import { openAdmin } from "../admin.mjs";
import { openEditSettings, updateSettings } from "./_settings_common.mjs";

export const meta = { id: "general-settings", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await openEditSettings(ctx);

  await ctx.line("details");
  await ctx.pointAt('input[name="store[store_phone]"]', { settle: 2500 });

  await ctx.line("hours");
  await ctx.reveal('select[name="store[timezone]"]');
  await ctx.pointAt('select[name="store[timezone]"]', { settle: 800 });
  const sunday = 'input[type="checkbox"][name="store_settings[business_hours][0][closed]"]';
  await ctx.reveal(sunday);
  await ctx.click(sunday, { settle: 900 });

  await ctx.line("float");
  await ctx.click('button.settings-tab[data-tab="operations"]', { settle: 800 });
  const f = 'input[name="store[default_opening_float]"]';
  await ctx.reveal(f);
  await page.$eval(f, (e) => { e.value = ""; });
  await ctx.type(f, "200", { delay: 160, settle: 600 });

  await ctx.line("payments");
  await ctx.reveal('input[type="checkbox"][name="store[payment_cash_enabled]"]', { always: true });
  await ctx.pointAt('input[type="checkbox"][name="store[payment_debit_enabled]"]', { settle: 2500 });

  await ctx.line("save");
  await updateSettings(ctx);
  await ctx.expect(() => page.evaluate(() => location.pathname === "/store_settings"), "settings didn't save");
  await ctx.pause(1200);
  await ctx.finishSpeaking();
}
