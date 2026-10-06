/** Storefront -> Promo Codes -> New Promo Code. */
import { openAdmin, afterNav } from "../admin.mjs";
import { openStorefront } from "./_storefront_common.mjs";

export const meta = { id: "promo-codes", seed: ["--storefront"], viewport: { width: 1600, height: 900 }, worker1: true };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await openStorefront(ctx);
  await ctx.click('main a[href="/admin/promo_codes"]', { settle: 500 });
  await afterNav(ctx, { selector: '[data-tour="create-promo"]' });
  await ctx.click('[data-tour="create-promo"]', { settle: 500 });
  await afterNav(ctx, { selector: "#promo_code_code" });
  await ctx.line("code");
  await ctx.type("#promo_code_code", "WELCOME10", { delay: 90, settle: 400 });
  await ctx.line("type");
  await ctx.select("#promo_code_discount_type", "percentage", { settle: 400 });
  await page.$eval("#promo_code_discount_value", (e) => { e.value = ""; });
  await ctx.type("#promo_code_discount_value", "10", { delay: 150, settle: 400 });
  await ctx.line("limits");
  await ctx.type("#promo_code_min_order_amount", "25", { delay: 150, settle: 300 });
  await ctx.type("#promo_code_max_uses", "100", { delay: 150, settle: 400 });
  await ctx.click('form[action="/admin/promo_codes"] [type="submit"]', { settle: 600 });
  await afterNav(ctx);
  await ctx.expect(() => page.evaluate(() => /WELCOME10/.test(document.body.innerText) && !/\/new$/.test(location.pathname)), "the code wasn't created");
  await ctx.line("use");
  await ctx.pause(2500);
  await ctx.line("pause");
  await ctx.pause(2000);
  await ctx.finishSpeaking();
}
