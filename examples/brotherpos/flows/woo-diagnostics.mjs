/** WooCommerce -> BrotherPOS Diagnostics in WordPress: the checks, the sync rows, the report. */
import { wooSetup, wpLogin, WP, WOO_RESOURCES } from "./_woo_common.mjs";

export const meta = { id: "woo-diagnostics", seed: [], viewport: { width: 1600, height: 900 }, resources: WOO_RESOURCES };

export async function setup(ctx, { lang }) {
  wooSetup({ lang, pull: true });
  await wpLogin(ctx);
  await ctx.page.goto(`${WP}/wp-admin/admin.php?page=wc-weight-pricing`, { waitUntil: "domcontentloaded" });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pointAt('#toplevel_page_woocommerce a[href="admin.php?page=wccwp-diagnostics"]', { settle: 800 }).catch(() => {});
  await ctx.goto(`${WP}/wp-admin/admin.php?page=wccwp-diagnostics`);
  await page.waitForSelector("table.widefat", { timeout: 30000 });
  await ctx.line("rows");
  await ctx.pointAt("table.widefat", { settle: 2500 });
  await ctx.line("sync");
  const sync = await page.evaluate(() => {
    const t = [...document.querySelectorAll("table.widefat")].find((x) => /BrotherPOS|ingest|Brother POS/i.test(x.innerText));
    t?.setAttribute("data-rec", "sync");
    return !!t;
  });
  if (sync) { await ctx.reveal('[data-rec="sync"]', { always: true }); await ctx.pointAt('[data-rec="sync"]', { settle: 2500 }); } else await ctx.pause(2500);
  await ctx.line("fix");
  await ctx.reveal('form:has(input[name="wccwp_diag_action"])', { always: true }).catch(() => {});
  await ctx.pause(2200);
  await ctx.line("report");
  await ctx.reveal("textarea[readonly]", { always: true });
  await ctx.pointAt("textarea[readonly]", { settle: 2200 });
  await ctx.finishSpeaking();
}
