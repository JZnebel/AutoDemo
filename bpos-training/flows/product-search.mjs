/** Finding products on the register: search, categories, Clear. */
import { openRegister, productCard, byText, L } from "../register.mjs";

export const meta = { id: "product-search", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) { await openRegister(ctx, { lang }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("scan");
  await ctx.pause(3500);

  await ctx.line("search");
  await ctx.type('[data-tour="product-search"] input', "kush", { delay: 180, settle: 1600 });

  await ctx.line("pick");
  await ctx.click((await productCard(page, "Pink Kush (AAAA+)")).sel, { settle: 1200 });
  const preset = '[data-tour="weight-preset"][data-weight="3.5"]';
  await page.waitForSelector(preset, { visible: true, timeout: 8000 });
  await ctx.click(preset, { settle: 1200 });

  await ctx.line("category");
  await ctx.click('[data-tour="clear-filters"]', { settle: 900 });
  await ctx.click(await byText(page, ["Edibles"], "button", "edibles"), { settle: 1500 });

  await ctx.line("clear");
  await ctx.click('[data-tour="clear-filters"]', { settle: 1500 });
  await ctx.finishSpeaking();
}
