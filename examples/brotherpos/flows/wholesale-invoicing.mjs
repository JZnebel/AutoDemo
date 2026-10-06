/** Wholesale invoicing — the order was approved, so its invoice exists; record a payment. */
import { afterNav } from "../admin.mjs";
import { DIST, placeOrderOffCamera, advanceOrderOffCamera } from "./_wholesale_common.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "wholesale-invoicing", seed: ["--wholesale=connected"], viewport: { width: 1600, height: 900 }, worker1: true };

let id;
export async function setup(ctx) {
  await placeOrderOffCamera(ctx);
  id = await advanceOrderOffCamera(ctx, ["approve"]); // leaves the distributor signed in, on the order
}

export async function run(ctx) {
  const { page } = ctx;
  const inv = railsRun(`puts Invoice.order(:created_at).last.id`, { SUB: DIST.sub }).trim();
  await ctx.pause(500);
  await ctx.line("made");
  await ctx.pause(600);
  await ctx.line("view");
  await ctx.click(`main a[href="/admin/invoices/${inv}"]`, { settle: 500 });
  await afterNav(ctx, { selector: `form[action="/admin/invoices/${inv}/record_payment"]` });
  await ctx.line("amount");
  await ctx.pointAt(`form[action="/admin/invoices/${inv}/record_payment"] input[name="amount"]`, { settle: 800 });
  await ctx.select(`form[action="/admin/invoices/${inv}/record_payment"] select[name="payment_method"]`, "e_transfer", { settle: 400 });
  await ctx.type(`form[action="/admin/invoices/${inv}/record_payment"] input[name="reference_number"]`, "CA7Q2M9X", { delay: 90, settle: 400 });
  await ctx.line("record");
  await ctx.click(`form[action="/admin/invoices/${inv}/record_payment"] [type="submit"]`, { settle: 700 });
  await afterNav(ctx);
  await ctx.expect(async () => /paid/.test(railsRun(`puts Invoice.find(${inv}).status`, { SUB: DIST.sub })), "the payment wasn't recorded");
  await ctx.line("paid");
  await ctx.pause(1500);
  await ctx.line("report");
  await ctx.pause(1500);
  await ctx.finishSpeaking();
}
