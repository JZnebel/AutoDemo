/** Wholesale pairing, shot 3 of 3 — the distributor approves. */
import { afterNav } from "../admin.mjs";
import { DIST, signInTo } from "./_wholesale_common.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "wholesale-pairing-approve", viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await signInTo(ctx, DIST, "/admin/retailer_connections"); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(400);
  await ctx.line("approve");
  const id = railsRun(`puts RetailerConnection.order(:created_at).last&.id`, { SUB: DIST.sub }).trim();
  await ctx.click(`main a[href="/admin/retailer_connections/${id}"]`, { settle: 500 });
  await afterNav(ctx, { selector: `form[action="/admin/retailer_connections/${id}/approve"] [type="submit"]` });
  await ctx.click(`form[action="/admin/retailer_connections/${id}/approve"] [type="submit"]`, { settle: 600 });
  await ctx.click("#confirmation-modal-confirm-btn", { settle: 700 });
  await afterNav(ctx);
  await ctx.expect(async () => /active/.test(railsRun(`puts RetailerConnection.find(${id}).status`, { SUB: DIST.sub })), "the connection wasn't approved");
  await ctx.line("done");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}
