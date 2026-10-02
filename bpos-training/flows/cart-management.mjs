/** The cart: tap again for another, + and -, type a quantity, remove a line, a manual
 *  item, and where Clear is. */
import { openRegister, productCard, byText, cartLineControl, L } from "../register.mjs";

export const meta = { id: "cart-management", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) { await openRegister(ctx, { lang }); }

const qtyOf = (page, name) => page.evaluate((n) => {
  const cart = document.querySelector('[data-tour="cart-pane"]');
  const lines = [...cart.querySelectorAll("div")].filter((d) => d.querySelector('[data-tour="remove-item"]') && d.innerText.split("\n").some((l) => l.trim() === n));
  const line = lines.sort((a, b) => a.querySelectorAll("*").length - b.querySelectorAll("*").length)[0];
  const b = line && [...line.querySelectorAll("button")].find((x) => /^\d+$/.test(x.innerText.trim()));
  return b ? Number(b.innerText.trim()) : null;
}, name);

export async function run(ctx) {
  const { page } = ctx;
  const preRoll = "House Pre-Roll 1g";
  await ctx.pause(500);
  await ctx.line("add");
  await ctx.click((await productCard(page, preRoll)).sel, { settle: 900 });
  await ctx.click((await productCard(page, preRoll)).sel, { settle: 1200 });

  await ctx.line("plus");
  await ctx.click(await cartLineControl(page, preRoll, '[data-tour="qty-increase"]', "plus"), { settle: 900 });
  await ctx.click(await cartLineControl(page, preRoll, 'button[aria-label="Decrease quantity"], button[aria-label="Diminuer la quantité"]', "minus"), { settle: 1200 });

  await ctx.line("type");
  const qtyBtn = await page.evaluate((n) => {
    const cart = document.querySelector('[data-tour="cart-pane"]');
    const lines = [...cart.querySelectorAll("div")].filter((d) => d.querySelector('[data-tour="remove-item"]') && d.innerText.split("\n").some((l) => l.trim() === n));
    const line = lines.sort((a, b) => a.querySelectorAll("*").length - b.querySelectorAll("*").length)[0];
    const b = line && [...line.querySelectorAll("button")].find((x) => /^\d+$/.test(x.innerText.trim()));
    b?.setAttribute("data-rec", "qty");
    return !!b;
  }, preRoll);
  if (!qtyBtn) throw new Error("no quantity button");
  await ctx.click('[data-rec="qty"]', { settle: 500 });
  const qtyInput = '[data-tour="cart-pane"] input[inputmode="decimal"]';
  await ctx.type(qtyInput, "5", { delay: 200, settle: 300 });
  await page.keyboard.press("Enter");
  await ctx.pause(900);
  if ((await qtyOf(page, preRoll)) !== 5) throw new Error(`quantity is ${await qtyOf(page, preRoll)}, not 5`);

  await ctx.line("remove");
  await ctx.click((await productCard(page, "Glass Hand Pipe")).sel, { settle: 1200 });
  await ctx.click(await cartLineControl(page, "Glass Hand Pipe", '[data-tour="remove-item"]', "remove"), { settle: 1200 });

  await ctx.line("manual");
  await ctx.click(await byText(page, L("Manual Item"), "button", "manual"), { settle: 1000 });
  await ctx.type("#manual-item-name", "Rolling papers", { delay: 90, settle: 300 });
  await ctx.type("#manual-item-price", "2.50", { delay: 160, settle: 500 });
  await ctx.click('[data-tour="manual-item-modal"] button[type="submit"]', { settle: 1500 });

  await ctx.line("clear");
  await ctx.pointAt('button.icon-btn-danger[aria-label="Clear Cart"], button.icon-btn-danger[aria-label="Vider le panier"]', { settle: 2500 });
  await ctx.finishSpeaking();
}
