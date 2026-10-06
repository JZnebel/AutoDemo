/** A website order arrives in Brother POS: Orders, the WooCommerce badge, the details. */
import { openAdmin, afterNav, navClick } from "../admin.mjs";
import { wooSetup, wooOrder, WOO_RESOURCES } from "./_woo_common.mjs";

export const meta = { id: "woo-order-sync", seed: [], viewport: { width: 1600, height: 900 }, resources: WOO_RESOURCES };

export async function setup(ctx, { lang }) {
  wooSetup({ lang, pull: true });
  await openAdmin(ctx, { path: "/products" });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("checkout");
  wooOrder("DEMO-EDI-001", 2);
  await ctx.pause(2500);

  await ctx.line("lands");
  await navClick(ctx, "/orders");
  await afterNav(ctx, { selector: '[data-tour="orders-table"]' });
  await ctx.expect(async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    return page.evaluate(() => !!document.querySelector('a[href^="/orders/woocommerce/"]'));
  }, "the website order never arrived", 60000);
  await ctx.settle();
  await ctx.pointAt('a[href^="/orders/woocommerce/"]', { settle: 1500 });

  await ctx.line("view");
  await ctx.click('a[href^="/orders/woocommerce/"]', { settle: 500 });
  await afterNav(ctx);
  await ctx.pause(2500);

  await ctx.line("complete");
  const btn = await page.evaluate(() => {
    const b = [...document.querySelectorAll("main button, main input[type=submit]")].find((x) => x.getBoundingClientRect().width > 0 && /complet|termin/i.test(x.textContent + (x.value || "")));
    b?.setAttribute("data-rec", "complete");
    return !!b;
  });
  if (btn) await ctx.pointAt('[data-rec="complete"]', { settle: 2200 }); else await ctx.pause(2200);

  await ctx.line("void");
  await ctx.pause(2200);
  await ctx.finishSpeaking();
}
