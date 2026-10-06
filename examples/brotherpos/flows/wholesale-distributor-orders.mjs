/** Filling a wholesale order — the distributor approves, packs and hands it over. */
import { afterNav, navClick } from "../admin.mjs";
import { DIST, signInTo, placeOrderOffCamera, confirmIfAsked } from "./_wholesale_common.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "wholesale-distributor-orders", seed: ["--wholesale=connected"], viewport: { width: 1600, height: 900 }, worker1: true };

let id;
export async function setup(ctx) {
  await placeOrderOffCamera(ctx);
  id = railsRun(`puts WholesaleOrder.order(:created_at).last.id`, { SUB: DIST.sub }).trim();
  await signInTo(ctx, DIST, "/products");
}

const step = (s) => `form[action="/admin/wholesale_orders/${id}/${s}"] [type="submit"]`;
const status = () => railsRun(`puts WholesaleOrder.find(${id}).status`, { SUB: DIST.sub }).trim();

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await navClick(ctx, "/admin/wholesale_orders");
  await afterNav(ctx, { selector: `main a[href="/admin/wholesale_orders/${id}"]` });
  await ctx.line("pending");
  await ctx.click(`main a[href="/admin/wholesale_orders/${id}"]`, { settle: 500 });
  await afterNav(ctx, { selector: step("approve") });
  await ctx.line("approve");
  await ctx.click(step("approve"), { settle: 600 });
  await confirmIfAsked(ctx);
  await afterNav(ctx, { selector: step("mark_as_packed") });
  await ctx.expect(async () => status() === "approved", "the order wasn't approved");
  await ctx.line("invoice");
  await ctx.pause(1500);
  await ctx.line("pack");
  await ctx.click(step("mark_as_packed"), { settle: 600 });
  await confirmIfAsked(ctx);
  await afterNav(ctx, { selector: step("mark_as_ready_for_pickup") });
  await ctx.line("ready");
  await ctx.click(step("mark_as_ready_for_pickup"), { settle: 600 });
  await confirmIfAsked(ctx);
  await afterNav(ctx, { selector: step("mark_as_picked_up") });
  await ctx.line("pickedup");
  await ctx.click(step("mark_as_picked_up"), { settle: 600 });
  await confirmIfAsked(ctx);
  await afterNav(ctx);
  await ctx.expect(async () => status() === "picked_up", "the order wasn't marked picked up");
  await ctx.line("other");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}
