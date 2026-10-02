/** Products -> More Actions -> Weight Presets -> a new 4.5g preset. */
import { openAdmin, afterNav } from "../admin.mjs";

export const meta = { id: "weight-presets", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(2500);
  await ctx.click('[data-tour="more-actions"] summary', { settle: 900 });
  await ctx.click('[data-tour="more-actions"] a[href="/weight_presets"]', { settle: 500 });
  await afterNav(ctx, { selector: 'main a[href="/weight_presets/new"]' });

  await ctx.line("list");
  await ctx.pause(2500);

  await ctx.line("new");
  await ctx.click('main a[href="/weight_presets/new"]', { settle: 500 });
  await afterNav(ctx, { selector: "#weight_preset_name" });
  await ctx.type("#weight_preset_name", "4.5g", { delay: 150, settle: 300 });
  await ctx.type("#weight_preset_weight_value", "4.5", { delay: 180, settle: 700 });

  await ctx.line("save");
  await ctx.click('form[action="/weight_presets"] input[type="submit"]', { settle: 500 });
  await afterNav(ctx);
  if (await page.$("#weight_preset_name")) throw new Error("the preset form came back with an error");
  await ctx.pause(1000);

  await ctx.line("price");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}
