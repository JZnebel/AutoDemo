/** Payment notices, shot 2 of 2 — the distributor confirms it, then a statement. */
import { afterNav, navClick } from "../admin.mjs";
import { DIST, signInTo, confirmIfAsked } from "./_wholesale_common.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "wholesale-payment-confirm", viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await signInTo(ctx, DIST, "/admin/invoices"); }

export async function run(ctx) {
  const { page } = ctx;
  const inv = railsRun(`puts Invoice.order(:created_at).last.id`, { SUB: DIST.sub }).trim();
  const rc = railsRun(`puts RetailerConnection.last.id`, { SUB: DIST.sub }).trim();
  await ctx.pause(400);
  await ctx.line("seller");
  await ctx.click(`main a[href^="/admin/invoices/${inv}"]`, { settle: 500 });
  await afterNav(ctx, { selector: "#payment-notices" });
  await ctx.line("check");
  await ctx.pointAt("#payment-notices", { settle: 900 });
  await ctx.click(`#payment-notices form[action*="/confirm"] [type="submit"]`, { settle: 600 });
  await confirmIfAsked(ctx);
  await afterNav(ctx);
  await ctx.expect(async () => /confirmed/.test(railsRun(`puts InvoicePaymentNotice.last.status`, { SUB: DIST.sub })), "the notice wasn't confirmed");
  await ctx.line("balance");
  await ctx.pause(1200);
  await ctx.line("statement");
  await navClick(ctx, "/admin/retailer_connections");
  await afterNav(ctx, { selector: `main a[href="/admin/retailer_connections/${rc}"]` });
  await ctx.click(`main a[href="/admin/retailer_connections/${rc}"]`, { settle: 500 });
  await afterNav(ctx, { selector: `main a[href="/admin/retailer_connections/${rc}/statement"]` });
  await ctx.click(`main a[href="/admin/retailer_connections/${rc}/statement"]`, { settle: 500 });
  await afterNav(ctx);
  await ctx.line("shows");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}
