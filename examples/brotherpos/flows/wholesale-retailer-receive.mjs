/** Ordering from a distributor, shot 2 of 2 — the order was approved; receive it. */
import { afterNav } from "../admin.mjs";
import { RETAIL, signInTo, advanceOrderOffCamera, confirmIfAsked } from "./_wholesale_common.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "wholesale-retailer-receive", viewport: { width: 1600, height: 900 } };

let poId;
export async function setup(ctx) {
  await advanceOrderOffCamera(ctx, ["approve", "mark_as_packed", "mark_as_ready_for_pickup"]);
  poId = railsRun(`puts PurchaseOrder.order(:created_at).last.id`).trim();
  await signInTo(ctx, RETAIL, `/admin/purchase_orders/${poId}`);
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(400);
  await ctx.line("arrived");
  const receive = await page.evaluate((id) => {
    const el = [...document.querySelectorAll(`a[href$="/purchase_orders/${id}/prepare_receiving"]`)].find((e) => e.offsetParent);
    el?.setAttribute("data-rec", "receive");
    return !!el;
  }, poId);
  if (!receive) throw new Error("no Receive Order button");
  await ctx.click('[data-rec="receive"]', { settle: 500 });
  await afterNav(ctx, { selector: "#complete_receiving_btn" });
  await ctx.line("check");
  await ctx.pointAt('input[name^="quantities_received"]', { settle: 1500 });
  await ctx.line("complete");
  await ctx.click("#complete_receiving_btn", { settle: 600 });
  await confirmIfAsked(ctx);
  await afterNav(ctx);
  await ctx.expect(async () => Number(railsRun(`puts Product.where(name: "Boreal Berry Gummies 10x10mg").sum(:current_stock)`).trim()) >= 24, "the stock wasn't added");
  await ctx.line("stock");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}
