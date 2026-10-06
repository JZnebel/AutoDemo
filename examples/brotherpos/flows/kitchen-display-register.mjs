/** Kitchen display, shot 2 of 3: an order rung up at the register. */
import { openRegister, topmost, productCard, L } from "../register.mjs";

export const meta = { id: "kitchen-display-register", viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) { await openRegister(ctx, { lang, who: "clerk" }); }

export async function run(ctx, { lang } = {}) {
  const { page } = ctx;
  await ctx.pause(400);
  await ctx.line("order");
  for (const n of ["Bannock Burger", lang === "fr" ? "Frites" : "Fries"]) await ctx.click((await productCard(page, n)).sel, { settle: 700 });
  await ctx.click('[data-tour="tender-cash"]', { settle: 800 });
  await ctx.click(await topmost(page, L("Exact"), "exact"), { settle: 500 });
  await ctx.click(await topmost(page, L("Complete Sale"), "complete"), { settle: 1800 });
  await ctx.click(await topmost(page, L("Start New Sale"), "newsale"), { settle: 900 });
  await ctx.finishSpeaking();
}
