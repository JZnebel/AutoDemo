/** Taking a card payment on a card machine that isn't linked to the register. */
import { openRegister, byText, addToCart, L } from "../register.mjs";

export const meta = { id: "card-payment", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) {
  await openRegister(ctx, { lang });
  await addToCart(ctx.page, ["Mixed Strain Pre-Roll Pack (5 x 0.5g)", "Mango Gummies 10mg x 10"]);
  await ctx.pause(2500);
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("card");
  await ctx.pause(1500);
  await ctx.click('[data-tour="tender-card"]', { settle: 1300 });

  await ctx.line("approve");
  await ctx.pause(2200);
  await ctx.click(await byText(page, L("Complete Sale"), "button", "complete"), { settle: 2000 });

  await ctx.line("done");
  await ctx.pause(2000);
  await ctx.click(await byText(page, L("Start New Sale"), "button", "newsale"), { settle: 800 });
  await ctx.finishSpeaking();
}
