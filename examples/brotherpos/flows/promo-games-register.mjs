/** Promo games at the register: the game plays after a sale; a winning code redeemed later. */
import { openRegister, byText, topmost, productCard, L } from "../register.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "promo-games-register", seed: ["--open-drawer", "--promo-game"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) { await openRegister(ctx, { lang, who: "clerk" }); }

async function ringCash(ctx, name) {
  const { page } = ctx;
  const { sel } = await productCard(page, name);
  await ctx.click(sel, { settle: 700 });
  await ctx.click('[data-tour="tender-cash"]', { settle: 800 });
  await ctx.click(await topmost(page, L("Exact"), "exact"), { settle: 500 });
  await ctx.click(await topmost(page, L("Complete Sale"), "complete"), { settle: 1800 });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("sale");
  await ringCash(ctx, "Mango Gummies 10mg x 10");
  await ctx.line("close");
  await ctx.click(await byText(page, L("Start New Sale"), "button", "newsale"), { settle: 1500 });
  await ctx.line("plays");
  await ctx.expect(async () => Number(railsRun(`puts PromoWin.count`).trim()) > 0, "no prize was won", 20000);
  await ctx.pause(6500);
  await ctx.line("code");
  await ctx.pause(2500);
  await page.mouse.click(800, 450).catch(() => {}); // "Tap anywhere to dismiss"
  await ctx.pause(800);

  await ctx.line("redeem");
  const code = railsRun(`puts PromoWin.order(:created_at).last.reward_code`).trim();
  const { sel } = await productCard(page, "House Pre-Roll 1g");
  await ctx.click(sel, { settle: 700 });
  await ctx.type('[data-tour="product-search"] input', code, { delay: 110, settle: 300 });
  await page.keyboard.press("Enter");
  await ctx.pause(1200);
  await ctx.line("apply");
  const apply = await topmost(page, [...L("Apply Discount"), ...L("Add Free Item")], "apply");
  await ctx.click(apply, { settle: 1500 });
  await ctx.expect(async () => /true/.test(railsRun(`puts PromoWin.order(:created_at).last.redeemed`)) || await page.evaluate(() => /-|−/.test(document.querySelector('[data-tour="cart-pane"]')?.innerText || "")), "the prize wasn't applied", 10000);
  await ctx.line("finish");
  await ctx.pause(2000);
  await ctx.finishSpeaking();
}
