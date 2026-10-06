/** Payment notices, shot 1 of 2 — the buyer tells the distributor they paid. */
import { afterNav } from "../admin.mjs";
import { DIST, RETAIL, signInTo, placeOrderOffCamera, advanceOrderOffCamera } from "./_wholesale_common.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "wholesale-payment-notices", seed: ["--wholesale=connected"], viewport: { width: 1600, height: 900 }, worker1: true };

export async function setup(ctx) {
  await placeOrderOffCamera(ctx);
  await advanceOrderOffCamera(ctx, ["approve"]);
  const po = railsRun(`puts PurchaseOrder.order(:created_at).last.id`).trim();
  await signInTo(ctx, RETAIL, `/admin/purchase_orders/${po}`);
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("why");
  await ctx.pause(500);
  await ctx.line("open");
  const toggle = await page.evaluate(() => {
    const s = [...document.querySelectorAll("details > summary")].find((x) => x.closest("details").querySelector('[name="payment_notice[amount]"]'));
    s?.setAttribute("data-rec", "notice");
    return !!s;
  });
  if (!toggle) throw new Error("no Send payment notice on the purchase order");
  await ctx.click('[data-rec="notice"]', { settle: 600 });
  await ctx.line("fill");
  await ctx.select('select[name="payment_notice[payment_method]"]', "e_transfer", { settle: 300 });
  await ctx.pointAt('input[name="payment_notice[amount]"]', { settle: 600 });
  await ctx.type('input[name="payment_notice[reference]"]', "CA7Q2M9X", { delay: 90, settle: 400 });
  await ctx.line("send");
  await ctx.click('details[open] form [type="submit"]', { settle: 700 });
  await afterNav(ctx);
  await ctx.expect(async () => /pending/.test(railsRun(`puts InvoicePaymentNotice.last&.status`, { SUB: DIST.sub })), "the notice wasn't sent");
  await ctx.line("waiting");
  await ctx.pause(1500);
  await ctx.finishSpeaking();
}
