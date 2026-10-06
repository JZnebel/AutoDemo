/** Turning optional features on and off: Settings -> Edit Settings -> a tab -> tick -> save. */
import { openAdmin } from "../admin.mjs";
import { openEditSettings, updateSettings } from "./_settings_common.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "feature-switches", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

const box = 'form[action="/store_settings"] input[type="checkbox"][name="store[enable_scale]"]';

export async function run(ctx) {
  await ctx.pause(500);
  await ctx.line("what");
  await ctx.pause(400);
  await ctx.line("open");
  await openEditSettings(ctx);
  await ctx.line("tabs");
  await ctx.click('button.settings-tab[data-tab="hardware"]', { settle: 900 });
  await ctx.line("tick");
  await ctx.reveal('label[for="store_enable_scale"]', { always: true });
  await ctx.click('label[for="store_enable_scale"]', { settle: 600 });
  await ctx.expect(() => ctx.page.$eval(box, (e) => e.checked), "the box didn't tick");
  await ctx.line("save");
  await updateSettings(ctx);
  await ctx.expect(async () => /true/.test(railsRun(`puts store.reload.enable_scale`)), "label printing didn't switch on");
  await ctx.line("appear");
  await ctx.pause(1500);
  await ctx.line("setup");
  await ctx.pause(1500);
  await ctx.finishSpeaking();
}
