/** A first look at the register: top bar, products, cart, paying, locking, settings. */
import { openRegister, productCard } from "../register.mjs";

export const meta = { id: "navigating-the-pos", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) { await openRegister(ctx, { lang }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("parts");
  await ctx.pointAt('[data-tour="product-grid"]', { settle: 1400 });
  await ctx.pointAt('[data-tour="cart-pane"]', { settle: 1400 });

  await ctx.line("find");
  await ctx.pointAt('[data-tour="quick-keys"]', { settle: 1500 });
  await ctx.pointAt('[data-tour="product-search"] input', { settle: 1500 });

  await ctx.line("add");
  await ctx.click((await productCard(page, "House Pre-Roll 1g")).sel, { settle: 900 });
  await ctx.click((await productCard(page, "Pink Kush (AAAA+)")).sel, { settle: 900 });
  await page.waitForSelector('[data-tour="weight-modal"]', { timeout: 15000 });
  await ctx.click('[data-tour="weight-modal"] [data-tour="weight-preset"]', { settle: 1000 });

  await ctx.line("pay");
  await ctx.pointAt('[data-tour="customer-search"] input', { settle: 1200 });
  await ctx.pointAt('[data-tour="tender-buttons"]', { settle: 1800 });

  await ctx.line("lock");
  await ctx.pointAt('[data-tour="lock-btn"]', { settle: 2500 });

  await ctx.line("settings");
  await ctx.pointAt('[data-tour="settings-btn"]', { settle: 2500 });
  await ctx.finishSpeaking();
}
