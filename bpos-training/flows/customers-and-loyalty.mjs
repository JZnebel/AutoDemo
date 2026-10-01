/** Putting a customer on a sale and spending their points on a reward. Jamie Morin has
 *  120 points from the seed; the store's default $5 reward costs 100. */
import { openRegister, productCard, byText, byTextStart, topmost, L } from "../register.mjs";

export const meta = { id: "customers-and-loyalty", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) { await openRegister(ctx, { lang }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("search");
  await ctx.pause(2200);
  await ctx.type('[data-tour="customer-search"] input', "Jamie", { delay: 170, settle: 1400 });

  await ctx.line("pick");
  await ctx.pause(300);
  await ctx.click(await byTextStart(page, ["Jamie Morin"], '[role="listbox"] button', "jamie"), { settle: 1500 });

  await ctx.line("items");
  await ctx.click((await productCard(page, "Mixed Strain Pre-Roll Pack (5 x 0.5g)")).sel, { settle: 1000 });

  await ctx.line("points");
  await ctx.pause(1000);
  await ctx.click(await byText(page, L("Apply Discount"), "button", "discount"), { settle: 1500 });
  await ctx.pointAt(await byTextStart(page, L("Loyalty Rewards"), "div", "rewards"), { settle: 1500 });

  await ctx.line("reward");
  await ctx.pause(300);
  await ctx.click(await byTextStart(page, ["$5 Off Your Order"], "button", "reward"), { settle: 1500 });

  await ctx.line("done");
  await ctx.pause(300);
  // Applying a reward may close the window; if it doesn't, the window's own Apply does.
  const stillOpen = await page.evaluate(() => !!document.querySelector('.fixed [data-rec="reward"], [role="dialog"] [data-rec="reward"]'));
  if (stillOpen) await ctx.click(await topmost(page, L("Apply Discount"), "apply-footer"), { settle: 1500 });
  if (!(await page.$eval('[data-tour="cart-totals"]', (e) => /5[.,]00/.test(e.innerText)))) throw new Error("the reward didn't apply");
  await ctx.pointAt('[data-tour="cart-totals"]', { settle: 1500 });
  await ctx.finishSpeaking();
}
