/** Shared by the WooCommerce clips: the local test website (wordpress-plugin/e2e, site A on
 *  :8891) wired to the freshly seeded training store before each take. */
import { execFileSync } from "child_process";
import { railsRun } from "./_admin_common.mjs";
import { CONFIG } from "../config.mjs";

export const WP = "http://localhost:8891";
export const WOO_RESOURCES = ["woo-site-a"];

/** wp-cli on the test site; returns stdout. */
export function wp(...args) {
  return execFileSync("docker", ["exec", "-u", "33", "e2e-e2e_cli_a-1", "wp", ...args, "--path=/var/www/html"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

const CONNECT = `
store.update!(enable_woocommerce_integration: true)
store.ensure_pos_api_key! if store.respond_to?(:ensure_pos_api_key!)
c = WoocommerceConfig.first_or_initialize
c.update!(enabled: true, sync_mode: "plugin_push", store_url: "http://e2e_wp_a", weight_unit: "g",
          auto_fulfill_orders: false, go_live: true, etransfer_email: "orders@riverstone.example",
          initial_import_completed: true)
puts [c.inbound_site_id, c.inbound_secret, store.pos_api_key].join("|")
`;

/** Turn on WooCommerce for the store and (unless connect: false) point the website at it,
 *  clean, in the take's language. Returns { siteId, secret, apiKey }. */
export function wooSetup({ lang = "en", connect = true, pull = false } = {}) {
  const [siteId, secret, apiKey] = railsRun(CONNECT).trim().split("\n").pop().split("|");
  wp("site", "switch-language", lang === "fr" ? "fr_CA" : "en_US");
  // A clean shop: no products or orders from earlier takes.
  for (const type of ["product", "product_variation", "shop_order"]) {
    const ids = wp("post", "list", `--post_type=${type}`, "--post_status=any", "--format=ids");
    if (ids) wp("post", "delete", ...ids.split(/\s+/), "--force");
  }
  try { wp("wc", "shop_order", "list", "--user=admin", "--format=ids"); } catch {}
  const opts = connect ? {
    wccwp_push_ingest_url: "http://pos_app:3000/webhooks/woocommerce", wccwp_push_site_id: siteId, wccwp_push_secret: secret,
    wccwp_pos_api_key: apiKey, wccwp_push_enabled: "1", wccwp_image_mode: "link",
    wccwp_store_admin_url: `${CONFIG.localBase}/admin`,
  } : { wccwp_push_ingest_url: "", wccwp_push_site_id: "", wccwp_push_secret: "", wccwp_pos_api_key: "", wccwp_push_enabled: "" };
  for (const [k, v] of Object.entries(opts)) wp("option", "update", k, v);
  for (const t of ["wccwp_products_pull_at", "wccwp_config_pull_at"]) { try { wp("transient", "delete", t); } catch {} }
  for (const o of ["wccwp_products_pulled_at", "wccwp_products_pull_log"]) { try { wp("option", "delete", o); } catch {} }
  if (pull) wooPull();
  return { siteId, secret, apiKey };
}

/** The plugin's own product + settings pull, off camera. */
export function wooPull() {
  wp("eval", "(new WCCWP_Product_Pull())->pull_and_apply(); (new WCCWP_Config_Pull())->pull_and_apply();");
}

/** A shopper's order on the website, as WooCommerce would create it. Returns its id. */
export function wooOrder(sku, qty = 1, who = { first_name: "Dana", last_name: "Whitfield", email: "dana@example.com" }) {
  const pid = wp("wc", "product", "list", "--user=admin", `--sku=${sku}`, "--field=id");
  if (!pid) throw new Error(`no website product with SKU ${sku}`);
  return wp("wc", "shop_order", "create", "--user=admin", "--status=processing", `--billing=${JSON.stringify(who)}`,
    `--line_items=${JSON.stringify([{ product_id: Number(pid), quantity: qty }])}`, "--porcelain");
}

/** Sign in to the website's admin (off camera). */
export async function wpLogin(ctx) {
  const { page } = ctx;
  await page.goto(`${WP}/wp-login.php`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#user_login", { timeout: 30000 });
  await page.$eval("#user_login", (e) => { e.value = "admin"; });
  await page.$eval("#user_pass", (e) => { e.value = "admin"; });
  await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }), page.click("#wp-submit")]);
}
