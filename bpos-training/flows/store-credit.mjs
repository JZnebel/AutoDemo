/** Paying with store credit: Dana Whitfield has $25 from the seed, enough for a pre-roll. */
import { openRegister, productCard, byText, byTextStart, topmost, L } from "../register.mjs";

export const meta = { id: "store-credit", seed: ["--open-drawer", "--store-credit"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) { await openRegister(ctx, { lang }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("customer");
  await ctx.pause(1800);
  await ctx.type('[data-tour="customer-search"] input', "Dana", { delay: 170, settle: 1400 });
  await ctx.click(await byTextStart(page, ["Dana Whitfield"], '[role="listbox"] button', "dana"), { settle: 1500 });

  await ctx.line("items");
  await ctx.click((await productCard(page, "House Pre-Roll 1g")).sel, { settle: 1200 });
  await ctx.click(await byText(page, L("Store Credit").map((t) => t.toUpperCase()), "button", "sc-tender"), { settle: 1500 });

  await ctx.line("balance");
  await ctx.pointAt(await byTextStart(page, L("Available Balance"), "span", "sc-balance"), { settle: 1800 });

  await ctx.line("complete");
  await ctx.pause(2000);
  await ctx.click(await topmost(page, L("Complete Sale"), "sc-complete"), { settle: 2500 });
  await ctx.finishSpeaking();
}
