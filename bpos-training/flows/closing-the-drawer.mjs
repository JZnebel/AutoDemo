/** Closing the drawer at the end of the day: count, End Day, the Z report. A cash sale is
 *  rung off camera first so there's something to count. */
import { openRegister, byText, quickSale, L } from "../register.mjs";

export const meta = { id: "closing-the-drawer", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) {
  await openRegister(ctx, { lang });
  await quickSale(ctx, ["House Pre-Roll 1g", "Mango Gummies 10mg x 10"]);   // $34 cash
  await ctx.pause(2500);
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(2200);
  await ctx.click('[data-tour="close-drawer-btn"]', { settle: 1400 });

  await ctx.line("expected");
  await ctx.pause(500);
  await ctx.pointAt(await byText(page, L("= Expected Cash:"), "span, p, div, dt", "expected"), { settle: 1500 });

  await ctx.line("count");
  await ctx.pause(1000);
  await ctx.type('input[type="number"]', "234", { delay: 240, settle: 600 });

  await ctx.line("mode");
  await ctx.pause(1200);
  await ctx.pointAt(await byText(page, L("End Shift"), "button", "shift"), { settle: 1800 });
  await ctx.click(await byText(page, L("End Day"), "button", "day"), { settle: 800 });

  await ctx.line("close");
  await ctx.pause(400);
  // The footer button now reads End Day too: the last match is the footer.
  const footer = await page.evaluate((w) => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const b = [...document.querySelectorAll("button")].filter((e) => w.includes(norm(e.innerText))).pop();
    b.setAttribute("data-rec", "close-footer");
    return !!b;
  }, L("End Day"));
  if (!footer) throw new Error("no End Day footer button");
  await ctx.click('[data-rec="close-footer"]', { settle: 2500 });
  await ctx.pointAt(await byText(page, L("Over / short"), "span, p, div, dt", "overshort"), { settle: 1200 });

  await ctx.line("done");
  await ctx.pause(400);
  await ctx.click(await byText(page, L("Done"), "button", "done"), { settle: 1200 });
  await ctx.finishSpeaking();
}
