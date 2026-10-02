/** Selling a $50 gift card (Gift Card Manager), then spending it on a sale with the GIFT
 *  CARD button. Needs a manager: clerks don't have Manage Gift Cards. */
import { openRegister, productCard, byText, topmost, L } from "../register.mjs";

export const meta = { id: "gift-cards", seed: ["--open-drawer", "--gift-cards"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) { await openRegister(ctx, { lang, who: "manager" }); }

const upper = (texts) => texts.map((t) => t.toUpperCase());

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(1800);
  await ctx.click(await byText(page, L("Gift Cards"), "button", "gc-manager"), { settle: 1200 });

  await ctx.line("amount");
  await ctx.pause(300);
  // "$50" in English, "50 $" in French.
  await ctx.click(await byText(page, ["$50", "50 $", "50\u00a0$", "50\u202f$"], "button", "gc-50"), { settle: 800 });
  await ctx.type('input[placeholder="e.g. John Smith"], input[placeholder="ex. Jean Dupont"]', "Dana Whitfield", { delay: 80, settle: 600 });

  await ctx.line("pay");
  await ctx.pause(300);
  await ctx.click(await topmost(page, L("Cash"), "gc-cash"), { settle: 700 });
  await ctx.click(await byText(page, L("Activate Gift Card"), "button", "gc-activate"), { settle: 2000 });

  await ctx.line("number");
  const code = await page.evaluate(() => {
    const el = [...document.querySelectorAll("span.font-mono")].find((e) => /^GC/.test(e.innerText.trim()));
    el?.setAttribute("data-rec", "gc-number");
    return el?.innerText.trim() || null;
  });
  if (!code) throw new Error("no gift card number shown");
  await ctx.pointAt('[data-rec="gc-number"]', { settle: 2200 });
  await ctx.click(await topmost(page, L("Close"), "gc-close"), { settle: 1200 });

  await ctx.line("use");
  await ctx.click((await productCard(page, "Mango Gummies 10mg x 10")).sel, { settle: 1200 });
  await ctx.click(await byText(page, upper(L("Gift Card")), "button", "gc-tender"), { settle: 1200 });

  await ctx.line("lookup");
  await ctx.type('input[placeholder="GC000000000000"]', code, { delay: 70, settle: 500 });
  await ctx.click(await topmost(page, L("Look Up"), "gc-lookup"), { settle: 1800 });

  await ctx.line("complete");
  await ctx.pause(1500);
  await ctx.click(await topmost(page, L("Complete Sale"), "gc-complete"), { settle: 2500 });
  await ctx.finishSpeaking();
}
