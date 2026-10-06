/** Slot machine payouts, shot 3 of 3: what each machine paid out. */
import { openAdmin } from "../admin.mjs";

export const meta = { id: "casino-payouts-report", viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/admin/gaming_machines" }); }

export async function run(ctx) {
  await ctx.pause(400);
  await ctx.line("report");
  await ctx.pointAt("main table tbody tr", { settle: 2500 });
  await ctx.line("export");
  await ctx.pause(1500);
  await ctx.finishSpeaking();
}
