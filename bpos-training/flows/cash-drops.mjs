/** A safe drop mid-shift, and where a payout is. */
import { openRegister, byText, L } from "../register.mjs";

export const meta = { id: "cash-drops", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) { await openRegister(ctx, { lang }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(2600);
  await ctx.click('[data-tour="cash-drop-btn"]', { settle: 1300 });

  await ctx.line("amount");
  await ctx.pointAt(await byText(page, L("Safe Drop"), "button", "safe"), { settle: 1200 });
  await ctx.click(await byText(page, ["$100", "100 $"], "button", "b100"), { settle: 800 });

  await ctx.line("record");
  await ctx.pause(500);
  await ctx.click(await byText(page, L("Record Cash Drop"), "button", "record"), { settle: 2200 });

  await ctx.line("payout");
  await ctx.pause(1500);
  await ctx.click('[data-tour="cash-drop-btn"]', { settle: 1200 });
  await ctx.click(await byText(page, L("Pay Out"), "button", "payout"), { settle: 1800 });
  await ctx.click(await byText(page, L("Cancel"), "button", "cancel"), { settle: 600 });
  await ctx.finishSpeaking();
}
