/** Wholesale portal, shot 1 of 2 — the distributor gives a buyer an access code. */
import { afterNav, navClick } from "../admin.mjs";
import { DIST, signInTo, shared } from "./_wholesale_common.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "wholesale-portal", seed: ["--wholesale"], viewport: { width: 1600, height: 900 }, worker1: true };

export async function setup(ctx) { await signInTo(ctx, DIST, "/products"); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("what");
  await ctx.pause(400);
  await ctx.line("open");
  await navClick(ctx, "/customers");
  await afterNav(ctx, { selector: "main details[data-dropdown] > summary" });
  await ctx.click("main details[data-dropdown] > summary", { settle: 500 });
  await ctx.click('main a[href="/admin/wholesale_customer_accesses"]', { settle: 500 });
  await afterNav(ctx, { selector: 'main a[href="/admin/wholesale_customer_accesses/new"]' });
  await ctx.click('main a[href="/admin/wholesale_customer_accesses/new"]', { settle: 500 });
  await afterNav(ctx, { selector: 'input[name="wholesale_customer_access[customer_name]"]' });
  await ctx.line("fill");
  await ctx.type('input[name="wholesale_customer_access[customer_name]"]', "Lakeside Smoke Shop", { delay: 70, settle: 400 });
  await page.$eval('input[name="wholesale_customer_access[expires_in_days]"]', (e) => { e.value = ""; });
  await ctx.type('input[name="wholesale_customer_access[expires_in_days]"]', "90", { delay: 150, settle: 400 });
  await ctx.click('form[action="/admin/wholesale_customer_accesses"] [type="submit"]', { settle: 700 });
  await afterNav(ctx);
  shared.portalCode = railsRun(`puts WholesaleCustomerAccess.order(:created_at).last.code`, { SUB: DIST.sub }).trim();
  await ctx.expect(() => page.evaluate((c) => document.body.innerText.includes(c), shared.portalCode), "the code isn't on the page");
  await ctx.line("send");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}
