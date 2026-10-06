/** Stock flows one way: change it in Brother POS, and the website picks it up on its next sync. */
import { openAdmin, goAdmin, afterNav } from "../admin.mjs";
import { productEditPath, railsRun } from "./_admin_common.mjs";
import { wooSetup, wooPull, wpLogin, wp, WP, WOO_RESOURCES } from "./_woo_common.mjs";
import { BASE } from "../config.mjs";

export const meta = { id: "woo-inventory-sync", seed: [], viewport: { width: 1600, height: 900 }, resources: WOO_RESOURCES };

export async function setup(ctx, { lang }) {
  wooSetup({ lang, pull: true });
  await openAdmin(ctx, { path: "/products" });
  await wpLogin(ctx); // after openAdmin, which clears every cookie
  await ctx.page.goto(`${WP}/wp-admin/edit.php?post_type=product&s=Pre-Roll`, { waitUntil: "domcontentloaded" });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("one-way");
  await ctx.pointAt("#the-list tr", { settle: 2000 });

  await ctx.line("sale");
  // A morning's pre-roll sales in the store (off camera), then back to the website.
  railsRun(`p = Product.find_by!(name: "House Pre-Roll 1g"); p.update_columns(current_stock: p.current_stock.to_f - 12)`);
  await ctx.goto(`${BASE}/products?search=Pre-Roll`);
  await afterNav(ctx);
  await ctx.pause(2200);

  await ctx.line("next");
  await ctx.goto(`${WP}/wp-admin/admin.php?page=wc-weight-pricing&tab=api-setup`);
  const sync = 'form:has(input[name="action"][value="wccwp_pull_products"]) input[type="submit"]';
  await ctx.reveal(sync, { always: true });
  await ctx.click(sync, { settle: 800 });
  await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => {});
  await ctx.goto(`${WP}/wp-admin/edit.php?post_type=product&s=Pre-Roll`);
  await ctx.expect(() => page.evaluate(() => /48/.test(document.querySelector("#the-list")?.innerText || "")), "the website stock didn't change", 30000);
  await ctx.pointAt("#the-list tr", { settle: 2000 });

  await ctx.line("half");
  await ctx.pause(2200);
  await ctx.line("dont");
  await ctx.pause(2200);
  await ctx.finishSpeaking();
}
