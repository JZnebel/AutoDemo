/** After a sale: View receipt, email it; the same from Sales History later. */
import { openRegister, productCard, topmost, L } from "../register.mjs";

export const meta = { id: "receipts", seed: ["--open-drawer", "--email-receipts"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) { await openRegister(ctx, { lang }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("sale");
  await ctx.click((await productCard(page, "Mango Gummies 10mg x 10")).sel, { settle: 800 });
  await ctx.click('[data-tour="tender-cash"]', { settle: 1000 });
  await ctx.click(await topmost(page, L("Exact"), "exact"), { settle: 700 });
  await ctx.click(await topmost(page, L("Complete Sale"), "complete"), { settle: 1800 });

  await ctx.line("view");
  await ctx.click(await topmost(page, L("View receipt"), "view"), { settle: 2500 });

  await ctx.line("email");
  await ctx.click(await topmost(page, L("Email"), "email"), { settle: 900 });
  await ctx.type("#receipt-typed-email", "dana@example.com", { delay: 70, settle: 400 });
  await ctx.click(await topmost(page, L("Send"), "send"), { settle: 2500 });
  const sent = await page.evaluate(() => /dana@example\.com/.test(document.querySelector('[role="dialog"], .fixed')?.innerText || document.body.innerText));
  if (!sent) throw new Error("no 'emailed' message");

  await ctx.line("print");
  await ctx.pointAt(await topmost(page, L("Print"), "print"), { settle: 2000 });

  await ctx.line("later");
  await ctx.click(await topmost(page, L("Close"), "close"), { settle: 800 });
  await ctx.click(await topmost(page, L("Start New Sale"), "new"), { settle: 1500 });
  await ctx.pointAt('[data-tour="cart-pane"]', { settle: 2000 });
  await ctx.finishSpeaking();
}
