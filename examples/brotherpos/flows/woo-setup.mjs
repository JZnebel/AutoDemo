/** Connecting a WooCommerce website: switch it on in Brother POS, choose the plugin
 *  connection, then paste the key and connection details into the plugin. */
import { openAdmin, goAdmin, afterNav } from "../admin.mjs";
import { openEditSettings, updateSettings } from "./_settings_common.mjs";
import { wooSetup, wpLogin, WP, WOO_RESOURCES } from "./_woo_common.mjs";
import { BASE } from "../config.mjs";

export const meta = { id: "woo-setup", seed: [], viewport: { width: 1600, height: 900 }, resources: WOO_RESOURCES };

let creds = null;
export async function setup(ctx, { lang }) {
  creds = wooSetup({ lang, connect: false });
  await openAdmin(ctx, { path: "/products" });
  await wpLogin(ctx); // after openAdmin, which clears every cookie
  await goAdmin(ctx, "/products");
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("on");
  await openEditSettings(ctx);
  await ctx.click('button.settings-tab[data-tab="integrations"]', { settle: 800 });
  const box = '[data-tour="woocommerce-settings"] input[type="checkbox"][name="store[enable_woocommerce_integration]"]';
  await ctx.reveal(box, { always: true });
  await ctx.pointAt(box, { settle: 1500 });

  await ctx.line("mode");
  await ctx.goto(`${BASE}/woocommerce/config`);
  await afterNav(ctx);
  await ctx.click('main a[href="/woocommerce/config/edit"]', { settle: 500 });
  await afterNav(ctx, { selector: "#woocommerce_config_sync_mode" });
  await ctx.select("#woocommerce_config_sync_mode", "plugin_push", { settle: 900 });
  await ctx.click('form[action="/woocommerce/config"] [type="submit"]', { settle: 600 });
  await afterNav(ctx);

  await ctx.line("copy");
  await ctx.click("main details > summary", { settle: 900 }).catch(() => {});
  await ctx.pause(1800);

  await ctx.line("plugin");
  await ctx.goto(`${WP}/wp-admin/admin.php?page=wc-weight-pricing&tab=api-setup`);
  await page.waitForSelector('input[name="pos_api_key"]', { timeout: 30000 });
  await ctx.pause(1200);

  await ctx.line("paste");
  await ctx.type('input[name="pos_api_key"]', creds.apiKey, { delay: 4, settle: 300 });
  await ctx.click('input[name="save_pos_api_key"]', { settle: 600 });
  await page.waitForSelector('input[name="wccwp_push_ingest_url"]', { timeout: 30000 });
  await ctx.type('input[name="wccwp_push_ingest_url"]', "http://pos_app:3000/webhooks/woocommerce", { delay: 6, settle: 200 });
  await ctx.type('input[name="wccwp_push_site_id"]', creds.siteId, { delay: 4, settle: 200 });
  await ctx.type('input[name="wccwp_push_secret"]', creds.secret, { delay: 2, settle: 300 });
  await ctx.click('input[name="save_catalog_pull"]', { settle: 800 });
  await page.waitForSelector('input[name="pos_api_key"]', { timeout: 30000 });

  await ctx.line("sync");
  const sync = 'form:has(input[name="action"][value="wccwp_pull_products"]) input[type="submit"]';
  await ctx.reveal(sync, { always: true });
  await ctx.pointAt(sync, { settle: 2500 });
  await ctx.finishSpeaking();
}
