/** Modifier lists, shot 2 of 2: the register asks for the choices. */
import { openRegister, byTextStart, productCard, L } from "../register.mjs";

export const meta = { id: "modifier-lists-register", viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) { await openRegister(ctx, { lang, who: "clerk" }); }

export async function run(ctx, { lang } = {}) {
  const { page } = ctx;
  const pick = lang === "fr" ? ["Fromage", "Bacon"] : ["Cheese", "Bacon"];
  await ctx.pause(400);
  await ctx.line("tap");
  const { sel } = await productCard(page, "Bannock Burger");
  await ctx.click(sel, { settle: 1200 });
  await ctx.line("choose");
  for (const p of pick) await ctx.click(await byTextStart(page, [p], "div.cursor-pointer", `opt-${p}`), { settle: 500 });
  await ctx.click(await byTextStart(page, L("Add to Cart"), "button", "add"), { settle: 1200 });
  await ctx.expect(() => page.evaluate((p) => (document.querySelector('[data-tour="cart-pane"]')?.innerText || "").includes(p), pick[0]), "the choices aren't on the cart line");
  await ctx.line("price");
  await ctx.pause(2000);
  await ctx.finishSpeaking();
}
