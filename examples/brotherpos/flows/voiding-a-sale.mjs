/** Voiding a whole sale from Recent Sales. */
import { openRegister, byText, quickSale, latestSaleRow, L } from "../register.mjs";

export const meta = { id: "voiding-a-sale", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) {
  await openRegister(ctx, { lang });
  await quickSale(ctx, ["Glass Hand Pipe"]);
  await ctx.pause(2500);
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("find");
  await ctx.pause(2500);
  await ctx.click(await latestSaleRow(page), { settle: 1500 });

  await ctx.line("void");
  await ctx.pause(300);
  // "Void" and "Cancel" are both "Annuler" in French; the void button is the red one.
  await ctx.click("button.btn-danger", { settle: 1300 });
  await ctx.click(await byText(page, L("Wrong Item"), "button", "reason"), { settle: 900 });

  await ctx.line("confirm");
  await ctx.pause(300);
  await ctx.click(await byText(page, L("Confirm Void"), "button", "confirm"), { settle: 2500 });
  await ctx.finishSpeaking();
}
