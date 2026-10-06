/** Wholesale pairing, shot 2 of 3 — the retailer enters the code. */
import { afterNav, navClick } from "../admin.mjs";
import { RETAIL, signInTo, shared } from "./_wholesale_common.mjs";

export const meta = { id: "wholesale-pairing-retailer", viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await signInTo(ctx, RETAIL, "/products"); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(400);
  await ctx.line("retailer");
  await navClick(ctx, "/admin/distributor_connections");
  await afterNav(ctx, { selector: 'main a[href="/admin/distributor_connections/new"]' });
  await ctx.click('main a[href="/admin/distributor_connections/new"]', { settle: 500 });
  await afterNav(ctx, { selector: 'input[name="distributor_connection[pairing_code]"]' });
  await ctx.line("enter");
  await ctx.type('input[name="distributor_connection[pairing_code]"]', shared.code, { delay: 140, settle: 400 });
  await ctx.type('input[name="distributor_connection[label]"]', "Northern Lights", { delay: 70, settle: 400 });
  await ctx.click('form[action="/admin/distributor_connections"] [type="submit"]', { settle: 700 });
  await afterNav(ctx);
  await ctx.expect(() => page.evaluate(() => /Northern Lights/.test(document.body.innerText) && !/\/new$/.test(location.pathname)), "the connection wasn't requested");
  await ctx.line("waits");
  await ctx.pause(1500);
  await ctx.finishSpeaking();
}
