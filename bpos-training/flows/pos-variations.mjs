/** A product with flavours: pick two Wedding Cake and one Pink Kush in one go. */
import { openRegister, productCard } from "../register.mjs";

export const meta = { id: "pos-variations", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) { await openRegister(ctx, { lang }); }

/** Tag the option tile for a variation whose name ends with `flavour`, or a control in it. */
async function option(page, flavour, tag, css = null) {
  const ok = await page.evaluate((f, t, c) => {
    const modal = document.querySelector('[data-tour="variation-modal"]');
    const p = [...(modal?.querySelectorAll("p") || [])].find((x) => x.innerText.trim().endsWith(f));
    const tile = p?.closest('[class*="variation-option"]');
    const el = c ? [...(tile?.querySelectorAll(c) || [])].pop() : tile;
    el?.setAttribute("data-rec", t);
    return !!el;
  }, flavour, tag, css);
  if (!ok) throw new Error(`no ${flavour} option`);
  return `[data-rec="${tag}"]`;
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("tap");
  await ctx.click((await productCard(page, "Live Resin 510 Cart 0.5g")).sel, { settle: 1200 });
  await page.waitForSelector('[data-tour="variation-modal"]', { visible: true });

  await ctx.line("pick");
  await ctx.click(await option(page, "Wedding Cake (Hybrid)", "wc"), { settle: 900 });
  await ctx.click(await option(page, "Wedding Cake (Hybrid)", "wc-plus", "button.icon-btn"), { settle: 900 });

  await ctx.line("more");
  await ctx.click(await option(page, "Pink Kush (Indica)", "pk"), { settle: 1200 });

  await ctx.line("add");
  await ctx.click('[data-tour="variation-modal"] button.btn-primary', { settle: 1500 });
  const lines = await page.evaluate(() => document.querySelector('[data-tour="cart-pane"]').innerText);
  if (!/Wedding Cake/.test(lines) || !/Pink Kush/.test(lines)) throw new Error("the flavours aren't in the cart");
  await ctx.pointAt('[data-tour="cart-pane"]', { settle: 2000 });
  await ctx.finishSpeaking();
}
