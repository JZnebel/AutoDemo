/** Settings -> RezWeed: switch the listing on, match categories, publish the menu. */
import { openAdmin, afterNav } from "../admin.mjs";
import { openEditSettings, updateSettings } from "./_settings_common.mjs";

export const meta = { id: "rezweed-sync", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

async function tick(ctx, id) {
  const sel = `#${id}`;
  await ctx.reveal(sel, { always: true });
  if (!(await ctx.page.$eval(sel, (e) => e.checked))) await ctx.click(sel, { settle: 600 });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("why");
  await ctx.pause(1800);

  await ctx.line("on");
  await openEditSettings(ctx);
  await tick(ctx, "store_rezweed_enabled");
  await updateSettings(ctx);
  await ctx.click('main a[href="/store_settings/edit"]', { settle: 500 });
  await afterNav(ctx, { selector: '[data-tour="rezweed-sync"]' });

  await ctx.line("map");
  await ctx.reveal('select[name^="rezweed_categories["]', { always: true });
  await ctx.pointAt('select[name^="rezweed_categories["]', { settle: 1500 });
  await ctx.click('[form="rezweed_category_form"][type="submit"]', { settle: 600 });
  await afterNav(ctx, { selector: '[data-tour="rezweed-sync"]' });

  await ctx.line("publish");
  if (!page.url().includes("/edit")) {
    await ctx.click('main a[href="/store_settings/edit"]', { settle: 500 });
    await afterNav(ctx, { selector: '[data-tour="rezweed-sync"]' });
  }
  await tick(ctx, "store_sync_to_rezweed");
  await updateSettings(ctx);
  await ctx.pause(1200);

  await ctx.line("product");
  await ctx.pause(2500);

  await ctx.line("deals");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}
