/** Payment issues, shot 2 of 2: the button is on the register now; declines and change. */
import { openRegister, byText, topmost, productCard, L } from "../register.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "payment-issues-register", viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) { await openRegister(ctx, { lang, who: "clerk" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(400);
  await ctx.line("appears");
  const { sel } = await productCard(page, "Mango Gummies 10mg x 10");
  await ctx.click(sel, { settle: 900 });
  const et = await byText(page, L("E-Transfer").map((x) => x.toUpperCase()), "button", "etransfer");
  await ctx.pointAt(et, { settle: 600 });
  await ctx.click(et, { settle: 900 });
  await ctx.type('[aria-labelledby="etransfer-modal-title"] input', "CA7Q2M9X", { delay: 90, settle: 400 });
  await ctx.click(await byText(page, L("Complete Sale"), '[aria-labelledby="etransfer-modal-title"] button', "et-done"), { settle: 1800 });
  await ctx.expect(async () => /etransfer/.test(railsRun(`puts Sale.order(:created_at).last&.payment_method`)), "the e-Transfer sale wasn't recorded");
  await ctx.click(await topmost(page, L("Start New Sale"), "newsale"), { settle: 900 });
  await ctx.line("declined");
  await ctx.pause(2000);
  await ctx.line("lost");
  await ctx.pause(2500);
  await ctx.line("change");
  await ctx.pause(2000);
  await ctx.finishSpeaking();
}
