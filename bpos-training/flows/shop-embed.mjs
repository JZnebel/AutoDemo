/** The shoppable snippet: cart and checkout inside your own website. */
import { openAdmin, afterNav } from "../admin.mjs";
import { openEditSettings } from "./_settings_common.mjs";

export const meta = { id: "shop-embed", seed: ["--storefront"], viewport: { width: 1600, height: 900 }, worker1: true };

export async function setup(ctx) {
  await ctx.page.setBypassCSP(true);
  await openAdmin(ctx, { path: "/products" });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("why");
  await openEditSettings(ctx);
  await ctx.click('button.settings-tab[data-tab="integrations"]', { settle: 800 });
  await ctx.reveal('#tab-integrations a[href="/admin/online_menu"]', { always: true });
  await ctx.click('#tab-integrations a[href="/admin/online_menu"]', { settle: 500 });
  await afterNav(ctx, { selector: "#shop-snippet" });
  await ctx.line("copy");
  await ctx.reveal("#shop-snippet", { always: true });
  await ctx.pointAt("#shop-snippet", { settle: 1800 });
  await ctx.line("paste");
  await ctx.pause(2200);
  await ctx.line("cart");
  const shop = await page.$eval("#builder-mode", (s) => [...s.options].find((o) => /shop|cart|panier/i.test(o.text + o.value))?.value || "");
  if (shop) { await ctx.reveal("#builder-mode"); await ctx.select("#builder-mode", shop, { settle: 1200 }); }
  await ctx.reveal("#online-menu-preview", { always: true });
  await ctx.pause(2500);
  await ctx.line("test");
  await ctx.pause(2200);
  await ctx.finishSpeaking();
}
