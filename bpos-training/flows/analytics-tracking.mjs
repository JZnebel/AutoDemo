/** Storefront -> Customize -> Analytics: paste your Google Analytics ID, save, publish. */
import { openAdmin } from "../admin.mjs";
import { openStorefront, openEditorSection, saveAndPublish } from "./_storefront_common.mjs";

export const meta = { id: "analytics-tracking", seed: ["--storefront"], viewport: { width: 1600, height: 900 }, worker1: true };

export async function setup(ctx) {
  await ctx.page.setBypassCSP(true);
  await openAdmin(ctx, { path: "/products" });
}

export async function run(ctx) {
  await ctx.pause(500);
  await ctx.line("why");
  await ctx.pause(1500);
  await ctx.line("open");
  await openStorefront(ctx);
  await openEditorSection(ctx, "analytics");
  await ctx.line("ga");
  const ga = 'input[name="storefront_config[ga4_measurement_id]"]';
  await ctx.reveal(ga, { always: true });
  await ctx.type(ga, "G-4R8K2PZQ1X", { delay: 90, settle: 500 });
  await ctx.line("others");
  await ctx.pointAt('input[name="storefront_config[facebook_pixel_id]"]', { settle: 1500 });
  await ctx.line("save");
  await saveAndPublish(ctx);
  await ctx.pause(1200);
  await ctx.line("check");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}
