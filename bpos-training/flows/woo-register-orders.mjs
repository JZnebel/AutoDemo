/** WooCommerce orders at the register: the Orders tab, the order, Load into Register. */
import { openRegister, byTextStart, L } from "../register.mjs";
import { wooSetup, wooOrder, WOO_RESOURCES } from "./_woo_common.mjs";

export const meta = { id: "woo-register-orders", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 }, resources: WOO_RESOURCES };

export async function setup(ctx, { lang }) {
  wooSetup({ lang, pull: true });
  wooOrder("DEMO-PR-001", 3, { first_name: "Jamie", last_name: "Morin", email: "jamie@example.com" });
  await openRegister(ctx, { lang, who: "manager" });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("tab");
  const tab = async () => byTextStart(page, L("Orders"), "button", "orders-tab");
  await ctx.expect(async () => /\d/.test(await page.$eval(await tab(), (b) => b.textContent)), "the website order never showed", 60000);
  await ctx.click(await tab(), { settle: 900 });

  await ctx.line("find");
  await ctx.expect(() => page.evaluate(() => {
    const hits = [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().width > 0 && /Jamie/.test(e.innerText || "") && /#|n[°º]/.test(e.innerText || ""));
    const el = hits.sort((a, b) => a.innerText.length - b.innerText.length)[0];
    el?.setAttribute("data-rec", "order");
    return !!el;
  }), "the order isn't in the list");
  await ctx.click('[data-rec="order"]', { settle: 1200 });

  await ctx.line("check");
  await ctx.pause(2200);

  await ctx.line("load");
  await ctx.click(await byTextStart(page, L("Load into Register"), "button", "load"), { settle: 1500 });
  await ctx.expect(() => page.evaluate(() => /Pre-Roll/.test(document.body.innerText)), "the order didn't load");
  await ctx.pause(1200);

  await ctx.line("pay");
  await ctx.pause(2200);
  await ctx.finishSpeaking();
}
