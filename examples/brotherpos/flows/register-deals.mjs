/** Deals at the register: a sale price on the card, and a free item once the cart is big
 *  enough. Seeded: 20% off Edibles, and a free House Pre-Roll over $50. */
import { openRegister, productCard, byTextStart, L } from "../register.mjs";

export const meta = { id: "register-deals", seed: ["--open-drawer", "--deals"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) { await openRegister(ctx, { lang }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("auto");
  await ctx.pause(2500);

  await ctx.line("sale");
  const card = (await productCard(page, "Mango Gummies 10mg x 10")).sel;
  if (!(await page.$(`${card} .line-through`))) throw new Error("no crossed-out regular price on the gummies");
  await ctx.pointAt(`${card} .line-through`, { settle: 2000 });
  await ctx.click(card, { settle: 1500 });

  await ctx.line("progress");
  const prog = L("Spend {{amount}} more to get:").map((t) => t.split("{{")[0].trim());
  await ctx.pointAt(await byTextStart(page, prog, "div", "progress"), { settle: 2500 });

  await ctx.line("free");
  await ctx.click((await productCard(page, "GMO Live Resin 1g")).sel, { settle: 2500 });
  const free = await page.evaluate((w) => w.some((x) => document.querySelector('[data-tour="cart-pane"]').innerText.includes(x)), L("FREE"));
  if (!free) throw new Error("no FREE line in the cart");
  await ctx.pointAt(await byTextStart(page, L("FREE"), '[data-tour="cart-pane"] *', "free"), { settle: 2500 });
  await ctx.finishSpeaking();
}
