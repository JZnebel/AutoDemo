/** A 10% discount off the whole order. Two items go in the cart off camera. */
import { openRegister, byText, addToCart, topmost, L } from "../register.mjs";

export const meta = { id: "discounts", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) {
  await openRegister(ctx, { lang });
  await addToCart(ctx.page, ["Mixed Strain Pre-Roll Pack (5 x 0.5g)", "Mango Gummies 10mg x 10"]);
  await ctx.pause(2500);
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(1500);
  await ctx.click(await byText(page, L("Apply Discount"), "button", "discount"), { settle: 1500 });

  await ctx.line("choose");
  await ctx.pause(300);
  await ctx.pointAt(await byText(page, L("Entire Order"), "button", "entire"), { settle: 1600 });
  await ctx.pointAt(await byText(page, L("Percentage (%)"), "button", "pct"), { settle: 1200 });

  await ctx.line("pick");
  await ctx.pause(500);
  await ctx.click(await byText(page, ["10%", "10 %"], "button", "ten"), { settle: 900 });
  const reason = await page.evaluate(() => {
    const i = [...document.querySelectorAll("input, textarea")].find((x) => /Senior discount|aîné/i.test(x.placeholder || ""));
    if (!i) return null;
    i.setAttribute("data-rec", "reason");
    return '[data-rec="reason"]';
  });
  if (reason) await ctx.type(reason, "Regular customer", { delay: 70, settle: 500 });

  await ctx.line("apply");
  await ctx.pause(300);
  const footer = await topmost(page, L("Apply Discount"), "apply-footer");
  await ctx.click(footer, { settle: 1500 });
  if (!(await page.$eval('[data-tour="cart-totals"]', (e) => /10\s?%/.test(e.innerText)))) throw new Error("the discount didn't apply");
  await ctx.pointAt('[data-tour="cart-totals"]', { settle: 1800 });
  await ctx.finishSpeaking();
}
