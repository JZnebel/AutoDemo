/** Product sync: Brother POS is the master copy; one click on the website pulls the catalogue.
 *  Keeping a product or a whole category off the website. */
import { openAdmin, goAdmin, afterNav } from "../admin.mjs";
import { productEditPath } from "./_admin_common.mjs";
import { wooSetup, wpLogin, WP, WOO_RESOURCES } from "./_woo_common.mjs";
import { BASE } from "../config.mjs";

export const meta = { id: "woo-product-sync", seed: [], viewport: { width: 1600, height: 900 }, resources: WOO_RESOURCES };

let pipe = null;
export async function setup(ctx, { lang }) {
  wooSetup({ lang });
  await openAdmin(ctx, { path: "/products" });
  pipe = await productEditPath(ctx.page, "Glass Hand Pipe");
  await wpLogin(ctx); // after openAdmin, which clears every cookie
  await ctx.page.goto(`${WP}/wp-admin/admin.php?page=wc-weight-pricing&tab=api-setup`, { waitUntil: "domcontentloaded" });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("master");
  await ctx.pause(1800);

  await ctx.line("pull");
  const sync = 'form:has(input[name="action"][value="wccwp_pull_products"]) input[type="submit"]';
  await ctx.reveal(sync, { always: true });
  await ctx.click(sync, { settle: 800 });
  await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => {});
  await ctx.goto(`${WP}/wp-admin/edit.php?post_type=product`);
  await ctx.expect(() => page.evaluate(() => /Mango|Pre-Roll/.test(document.querySelector("#the-list")?.innerText || "")), "no products on the website", 30000);
  await ctx.pause(1200);

  await ctx.line("sku");
  await ctx.pointAt("#the-list tr", { settle: 2200 });

  await ctx.line("product");
  await ctx.goto(`${BASE}${pipe}`);
  await afterNav(ctx, { selector: "#product_is_freebie_only" });
  await ctx.reveal("#product_is_freebie_only", { always: true });
  await ctx.pointAt("#product_is_freebie_only", { settle: 2200 });

  await ctx.line("category");
  await ctx.goto(`${BASE}/categories`);
  await afterNav(ctx);
  await ctx.pointAt('form[action$="/toggle_woocommerce_sync"]', { settle: 2500 }).catch(() => ctx.pause(2500));
  await ctx.finishSpeaking();
}
