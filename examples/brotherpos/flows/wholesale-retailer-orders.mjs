/** Ordering from a distributor, shot 1 of 2 — the retailer places the order. */
import { afterNav, navClick } from "../admin.mjs";
import { RETAIL, ORDER, signInTo, markCatalogRow } from "./_wholesale_common.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "wholesale-retailer-orders", seed: ["--wholesale=connected"], viewport: { width: 1600, height: 900 }, worker1: true };

export async function setup(ctx) { await signInTo(ctx, RETAIL, "/products"); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await navClick(ctx, "/admin/distributor_connections");
  await afterNav(ctx, { selector: 'main a[href^="/admin/wholesale_orders/new?distributor_connection_id="]' });
  await ctx.click('main a[href^="/admin/wholesale_orders/new?distributor_connection_id="]', { settle: 500 });
  await afterNav(ctx, { selector: "input[data-order-qty]" });
  await ctx.line("catalog");
  await ctx.pause(1200);
  await ctx.line("add");
  for (const [i, [name, qty]] of ORDER.entries()) {
    if (!(await markCatalogRow(page, name, `o${i}`))) throw new Error(`${name} isn't in the catalog`);
    await page.$eval(`[data-rec="o${i}-qty"]`, (e) => { e.value = ""; });
    await ctx.type(`[data-rec="o${i}-qty"]`, qty, { delay: 150, settle: 300 });
    await ctx.click(`[data-rec="o${i}-add"]`, { settle: 600 });
  }
  await ctx.line("place");
  await page.waitForFunction(() => !document.getElementById("submit-btn")?.disabled, { timeout: 10000 });
  await ctx.click("#submit-btn", { settle: 700 });
  await afterNav(ctx);
  await ctx.expect(async () => Number(railsRun(`puts PurchaseOrder.count`).trim()) > 0, "the order wasn't placed");
  await ctx.line("sent");
  await ctx.pause(2000);
  await ctx.finishSpeaking();
}
