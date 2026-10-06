/** POS not loading: refresh, check nothing is waiting to send before clearing anything. */
import { openRegister, L } from "../register.mjs";

export const meta = { id: "pos-not-loading", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) { await openRegister(ctx, { lang, who: "clerk" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("internet");
  await ctx.pause(2000);
  await ctx.line("refresh");
  await ctx.pause(600);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-product-id]", { timeout: 30000 });
  await ctx.pause(1200);
  await ctx.line("pending");
  await ctx.click('[data-tour="sync-status"]', { settle: 1500 });
  await ctx.line("safe");
  await ctx.pause(2500);
  await page.keyboard.press("Escape").catch(() => {});
  await ctx.line("tabs");
  await ctx.pause(2000);
  await ctx.line("device");
  await ctx.pause(2000);
  await ctx.finishSpeaking();
}
