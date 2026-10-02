/** Settings -> Edit Settings -> General -> Loyalty Program Settings. */
import { openAdmin } from "../admin.mjs";
import { openEditSettings, updateSettings } from "./_settings_common.mjs";

export const meta = { id: "loyalty-setup", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(1500);
  await openEditSettings(ctx);

  await ctx.line("enable");
  await ctx.pointAt('label[for="store_loyalty_enabled"]', { settle: 1500 });
  if (!(await page.$eval("#store_loyalty_enabled", (c) => c.checked))) await ctx.click("#store_loyalty_enabled", { settle: 600 });

  await ctx.line("points");
  await ctx.type("#store_loyalty_points_per_dollar", "1", { delay: 200, settle: 1200 });

  await ctx.line("value");
  await ctx.type("#store_loyalty_point_value", "0.01", { delay: 200, settle: 1200 });

  await ctx.line("save");
  await updateSettings(ctx);
  await ctx.pause(1200);

  await ctx.line("next");
  await ctx.pause(1500);
  await ctx.finishSpeaking();
}
