/** Wholesale portal, shot 2 of 2 — the buyer signs in with the code and orders. */
import { afterNav } from "../admin.mjs";
import { DIST, baseOf, shared } from "./_wholesale_common.mjs";

export const meta = { id: "wholesale-portal-buyer", viewport: { width: 1600, height: 900 } };

export async function setup(ctx) {
  const { page } = ctx;
  const cdp = await page.createCDPSession();
  await cdp.send("Network.clearBrowserCookies");
  await cdp.detach();
  await page.goto(`${baseOf(DIST)}/wholesale`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[name="code"]', { timeout: 20000 });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(400);
  await ctx.line("buyer");
  await ctx.type('input[name="code"]', shared.portalCode, { delay: 140, settle: 400 });
  await ctx.click('form[action$="/wholesale_portal/login"] [type="submit"]', { settle: 700 });
  await afterNav(ctx, { selector: 'main a[href$="/wholesale_portal/catalog"]' });
  await ctx.line("catalog");
  await ctx.click('main a[href$="/wholesale_portal/catalog"]', { settle: 600 });
  await afterNav(ctx);
  await ctx.expect(() => page.evaluate(() => /Boreal Berry Gummies/.test(document.body.innerText)), "the catalog didn't open");
  await ctx.pause(2500);
  await ctx.line("orders");
  await ctx.pause(2000);
  await ctx.finishSpeaking();
}
