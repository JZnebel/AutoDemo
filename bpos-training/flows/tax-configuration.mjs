/** Settings -> Edit Settings -> Tax & Compliance: 13% HST. */
import { openAdmin } from "../admin.mjs";
import { openEditSettings, updateSettings } from "./_settings_common.mjs";

export const meta = { id: "tax-configuration", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(1500);
  await openEditSettings(ctx);
  await ctx.click('.settings-tab[data-tab="tax"]', { settle: 1000 });

  await ctx.line("province");
  await ctx.pointAt("#province_select", { settle: 1800 });

  await ctx.line("mode");
  await ctx.select("#tax_mode_select", "single", { settle: 1500 });

  await ctx.line("rate");
  await ctx.type("#store_tax_rate", "13", { delay: 220, settle: 400 });
  await ctx.type("#store_tax_name", "HST", { delay: 160, settle: 800 });

  await ctx.line("split");
  await ctx.pause(2500);

  await ctx.line("save");
  await updateSettings(ctx);
  const rate = await page.evaluate(async () => {
    const html = await (await fetch("/store_settings/edit", { headers: { Accept: "text/html" } })).text();
    return (html.match(/id="store_tax_rate"[^>]*value="([^"]*)"/) || html.match(/value="([^"]*)"[^>]*id="store_tax_rate"/) || [])[1];
  });
  if (!rate || parseFloat(rate) !== 13) throw new Error(`tax rate is ${rate}`);
  await ctx.pause(1500);
  await ctx.finishSpeaking();
}
