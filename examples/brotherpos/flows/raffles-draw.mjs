/** Raffles, shot 3 of 3: the draw. */
import { openAdmin, afterNav } from "../admin.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "raffles-draw", viewport: { width: 1600, height: 900 } };

let id;
export async function setup(ctx) {
  id = railsRun(`puts Raffle.order(:created_at).last.id`).trim().split("\n").pop();
  await openAdmin(ctx, { path: `/admin/raffles/${id}` });
}

export async function run(ctx) {
  await ctx.pause(400);
  await ctx.line("auto");
  await ctx.pause(1500);
  await ctx.line("now");
  await ctx.reveal('[data-raffle-spin-wheel-target="drawButton"], [data-raffle-lotto-balls-target="drawButton"]', { always: true });
  await ctx.click('[data-raffle-spin-wheel-target="drawButton"], [data-raffle-lotto-balls-target="drawButton"]', { settle: 9000 });
  await ctx.expect(async () => /drawn/.test(railsRun(`puts Raffle.find(${id}).status`)), "the draw didn't finish", 20000);
  await ctx.line("winner");
  await ctx.pause(2500);
  await ctx.line("live");
  await ctx.pause(2000);
  await ctx.finishSpeaking();
}
