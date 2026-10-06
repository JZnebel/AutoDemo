/** Settings -> Products & Inventory -> Cannabis Detail Fields and the stock display threshold. */
import { openAdmin } from "../admin.mjs";
import { openEditSettings, updateSettings } from "./_settings_common.mjs";

export const meta = { id: "product-display", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await openEditSettings(ctx);
  await ctx.click('button.settings-tab[data-tab="products"]', { settle: 800 });
  await ctx.reveal('[data-tour="cannabis-details"]', { always: true });

  await ctx.line("untick");
  const benefits = 'input[type="checkbox"][name="store[show_medical_benefits]"]';
  if (await page.$eval(benefits, (e) => e.checked)) await ctx.click(benefits, { settle: 600 });

  await ctx.line("kept");
  await ctx.pause(2500);

  await ctx.line("threshold");
  const t = 'input[name="store[stock_display_threshold]"]';
  await ctx.reveal(t);
  await page.$eval(t, (e) => { e.value = ""; });
  await ctx.type(t, "200", { delay: 160, settle: 600 });

  await ctx.line("save");
  await updateSettings(ctx);
  await ctx.expect(() => page.evaluate(() => location.pathname === "/store_settings"), "settings didn't save");
  await ctx.pause(1200);
  await ctx.finishSpeaking();
}
