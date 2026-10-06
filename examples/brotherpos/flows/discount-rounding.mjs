/** Settings -> Products & Inventory -> rounding: Canadian cash rounding, whole-dollar discounts. */
import { openAdmin } from "../admin.mjs";
import { openEditSettings, updateSettings } from "./_settings_common.mjs";

export const meta = { id: "discount-rounding", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

async function tick(ctx, name, on = true) {
  const sel = `input[type="checkbox"][name="store[${name}]"]`;
  await ctx.reveal(sel);
  if ((await ctx.page.$eval(sel, (e) => e.checked)) !== on) await ctx.click(sel, { settle: 500 });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await openEditSettings(ctx);
  await ctx.click('button.settings-tab[data-tab="products"]', { settle: 800 });
  await ctx.reveal('[data-tour="product-features"]', { always: true });

  await ctx.line("cash");
  await tick(ctx, "enable_cash_rounding");

  await ctx.line("card");
  await ctx.pause(2500);

  await ctx.line("discounts");
  await tick(ctx, "enable_manual_discount_rounding");
  await ctx.pointAt('input[type="checkbox"][name="store[enable_discount_rounding]"]', { settle: 1200 });

  await ctx.line("campaign");
  await ctx.pause(2000);

  await ctx.line("save");
  await updateSettings(ctx);
  await ctx.expect(() => page.evaluate(() => location.pathname === "/store_settings"), "settings didn't save");
  await ctx.pause(1200);
  await ctx.finishSpeaking();
}
