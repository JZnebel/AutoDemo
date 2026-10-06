/** Sync issues: a product missing from the website — its category's WooCommerce sync was off. */
import { openAdmin, afterNav } from "../admin.mjs";
import { railsRun } from "./_admin_common.mjs";
import { wooSetup, wpLogin, WP, WOO_RESOURCES } from "./_woo_common.mjs";
import { BASE } from "../config.mjs";

export const meta = { id: "troubleshoot-woo-sync", seed: [], viewport: { width: 1600, height: 900 }, resources: WOO_RESOURCES };

let cat;
export async function setup(ctx, { lang }) {
  cat = railsRun(`c = Category.find_by!(slug: "accessories"); c.update!(woocommerce_sync_enabled: false); puts c.id`).trim().split("\n").pop();
  wooSetup({ lang, pull: true });
  await openAdmin(ctx, { path: "/products" });
  await wpLogin(ctx); // after openAdmin, which clears every cookie
  await ctx.page.goto(`${WP}/wp-admin/edit.php?post_type=product&s=Pipe`, { waitUntil: "domcontentloaded" });
}

const onSite = (page) => page.evaluate(() => /Glass Hand Pipe/.test(document.querySelector("#the-list")?.innerText || ""));

export async function run(ctx) {
  const { page } = ctx;
  if (await onSite(page)) throw new Error("the pipe is already on the website");
  await ctx.pause(500);
  await ctx.line("missing");
  await ctx.pause(2000);
  await ctx.line("check");
  await ctx.goto(`${BASE}/categories`);
  await afterNav(ctx, { selector: `form[action="/categories/${cat}/toggle_woocommerce_sync"]` });
  const toggle = `form[action="/categories/${cat}/toggle_woocommerce_sync"] input[type="checkbox"]`;
  await ctx.reveal(toggle, { always: true });
  await ctx.line("on");
  await ctx.click(toggle, { settle: 1500 });
  await ctx.expect(async () => /true/.test(railsRun(`puts Category.find(${cat}).woocommerce_sync_enabled`)), "the category's sync didn't turn on");
  await ctx.line("pull");
  await ctx.goto(`${WP}/wp-admin/admin.php?page=wc-weight-pricing&tab=api-setup`);
  const sync = 'form:has(input[name="action"][value="wccwp_pull_products"]) input[type="submit"]';
  await ctx.reveal(sync, { always: true });
  await ctx.click(sync, { settle: 800 });
  await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => {});
  await ctx.goto(`${WP}/wp-admin/edit.php?post_type=product&s=Pipe`);
  await ctx.expect(() => onSite(page), "the pipe didn't reach the website", 30000);
  await ctx.line("there");
  await ctx.pointAt("#the-list tr", { settle: 1500 });
  await ctx.line("monitor");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}
