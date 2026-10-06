/** A cashier without Void Sales tries a void; a manager's PIN approves it. */
import { openRegister, byText, quickSale, latestSaleRow, topmost, L } from "../register.mjs";
import { creds } from "../config.mjs";

export const meta = { id: "manager-override", seed: ["--open-drawer", "--clerk-no-void"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) {
  await openRegister(ctx, { lang });
  await quickSale(ctx, ["Glass Hand Pipe"]);
  await ctx.pause(2500);
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("try");
  await ctx.pause(1500);
  await ctx.click(await latestSaleRow(page), { settle: 1300 });
  // "Void" and "Cancel" are both "Annuler" in French; the void button is the red one.
  await ctx.click("button.btn-danger", { settle: 1000 });
  await ctx.click(await byText(page, L("Wrong Item"), "button", "reason"), { settle: 700 });
  await ctx.click(await byText(page, L("Confirm Void"), "button", "confirm"), { settle: 1800 });

  await ctx.line("prompt");
  const pin = 'input[type="password"][maxlength="4"]';
  await page.waitForSelector(pin, { visible: true, timeout: 8000 });
  await ctx.pointAt(pin, { settle: 2000 });

  await ctx.line("pin");
  await ctx.type(pin, creds().managerPin, { delay: 300, settle: 500 });
  await ctx.click(await topmost(page, L("Authorize"), "authorize"), { settle: 2500 });

  await ctx.line("done");
  const voided = await page.evaluate(() => /VOIDED|ANNUL/i.test(document.querySelector('[data-tour="cart-pane"]')?.innerText || ""));
  if (!voided) throw new Error("the sale wasn't voided");
  await ctx.pointAt(await latestSaleRow(page), { settle: 2500 });
  await ctx.finishSpeaking();
}
