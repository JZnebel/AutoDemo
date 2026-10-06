/** Kitchen display, shot 1 of 3: the setting and which categories go to the kitchen. */
import { openAdmin, afterNav, navClick } from "../admin.mjs";
import { openEditSettings } from "./_settings_common.mjs";

export const meta = { id: "kitchen-display", seed: ["--open-drawer", "--restaurant"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

export async function run(ctx) {
  await ctx.pause(500);
  await ctx.line("what");
  await ctx.pause(400);
  await ctx.line("setting");
  await openEditSettings(ctx);
  await ctx.click('button.settings-tab[data-tab="integrations"]', { settle: 900 });
  const box = 'input[type="checkbox"][name="store[enable_kitchen_workflow]"]';
  await ctx.reveal(box, { always: true });
  await ctx.pointAt(box, { settle: 1200 });
  await ctx.pointAt('input[name="store[station_label]"]', { settle: 1200 });
  await ctx.line("categories");
  await navClick(ctx, "/products");
  await afterNav(ctx, { selector: 'main a[href="/categories"]' });
  await ctx.click('main a[href="/categories"]', { settle: 600 });
  await afterNav(ctx, { selector: 'form[action$="/toggle_kitchen_print"]' });
  await ctx.pointAt('form[action$="/toggle_kitchen_print"]', { settle: 2000 });
  await ctx.finishSpeaking();
}
