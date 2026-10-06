/** Settings -> WooCommerce Monitor: is the connection healthy, and what failed. */
import { openAdmin, afterNav } from "../admin.mjs";
import { railsRun } from "./_admin_common.mjs";
import { wooSetup, WOO_RESOURCES } from "./_woo_common.mjs";

export const meta = { id: "woo-health-monitor", seed: [], viewport: { width: 1600, height: 900 }, resources: WOO_RESOURCES };

const LOGS = `
[["product_import", "completed", 50, 0, 6], ["order_import", "completed", 3, 0, 4], ["inventory_push", "completed", 14, 0, 3],
 ["order_import", "failed", 1, 1, 30], ["product_import", "completed", 52, 0, 1]].each do |type, status, n, bad, hours|
  log = WoocommerceSyncLog.create!(sync_type: type, status: status, started_at: hours.hours.ago, completed_at: hours.hours.ago + 20,
                                   records_processed: n, records_failed: bad, error_message: (status == "failed" ? ENV.fetch("ERR") : nil))
  log.update_columns(created_at: hours.hours.ago) # the monitor counts failures by when they were logged
end
`;
const ERR = { en: "Product not found for SKU HOUSE-PR-2G", fr: "Produit introuvable pour le SKU HOUSE-PR-2G" };

export async function setup(ctx, { lang }) {
  wooSetup({ lang, pull: true });
  railsRun(LOGS, { ERR: ERR[lang] || ERR.en });
  await openAdmin(ctx, { path: "/store_settings" });
}

export async function run(ctx) {
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.click('main a[href="/admin/woocommerce_monitor"]', { settle: 500 });
  await afterNav(ctx);
  await ctx.line("healthy");
  await ctx.pointAt("main .grid, main [class*=rounded]", { settle: 2500 });
  await ctx.line("logs");
  await ctx.reveal("main table", { always: true });
  await ctx.pointAt("main table tbody tr", { settle: 2500 });
  await ctx.line("detail");
  await ctx.pause(2500);
  await ctx.line("plugin");
  await ctx.pause(2200);
  await ctx.finishSpeaking();
}
