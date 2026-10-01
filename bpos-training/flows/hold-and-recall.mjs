/** Hold an order under a name, serve someone else, recall it. */
import { openRegister, productCard, byText, byTextStart, topmost, L } from "../register.mjs";

export const meta = { id: "hold-and-recall", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) { await openRegister(ctx, { lang }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("add");
  await ctx.pause(1500);
  await ctx.click((await productCard(page, "House Pre-Roll 1g")).sel, { settle: 900 });
  await ctx.click((await productCard(page, "Mango Gummies 10mg x 10")).sel, { settle: 900 });

  await ctx.line("hold");
  await ctx.pause(500);
  await ctx.click(await byText(page, L("Hold"), "button", "hold"), { settle: 1200 });
  // The order-name box in the Hold window (its placeholder differs by language).
  const nameBox = await page.evaluate(() => {
    const i = [...document.querySelectorAll('.fixed input[type="text"], [role="dialog"] input[type="text"]')]
      .find((x) => x.getBoundingClientRect().width > 0);
    i?.setAttribute("data-rec", "order-name");
    return !!i;
  });
  if (!nameBox) throw new Error("no order name box");
  await ctx.type('[data-rec="order-name"]', "Jamie", { delay: 150, settle: 700 });

  await ctx.line("save");
  await ctx.pause(300);
  // In French the window's button and the cart's Hold button read the same.
  await ctx.click(await topmost(page, L("Hold Order"), "hold-order"), { settle: 2000 });

  await ctx.line("recall");
  await ctx.pause(1200);
  await ctx.click('[data-tour="recall-btn"]', { settle: 1500 });
  await ctx.click(await byTextStart(page, ["Jamie"], "h3", "held"), { settle: 1000 });

  await ctx.line("back");
  await ctx.pause(300);
  await ctx.click(await topmost(page, L("Recall Order"), "recall-order"), { settle: 1800 });
  await ctx.pointAt('[data-tour="cart-totals"]', { settle: 1200 });
  await ctx.finishSpeaking();
}
