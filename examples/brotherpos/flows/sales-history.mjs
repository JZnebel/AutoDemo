/** Recent Sales under an empty cart: open a sale and view its receipt. */
import { openRegister, byTextStart, quickSale, latestSaleRow, topmost, L } from "../register.mjs";

export const meta = { id: "sales-history", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) {
  await openRegister(ctx, { lang });
  await quickSale(ctx, ["Glass Hand Pipe"]);
  await quickSale(ctx, ["Pink Kush (AAAA+)", "House Pre-Roll 1g"], { pay: "card" });
  await quickSale(ctx, ["Mango Gummies 10mg x 10", "Mixed Strain Pre-Roll Pack (5 x 0.5g)"]);
  await ctx.pause(2500);
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("where");
  await ctx.pointAt('[data-tour="cart-pane"]', { settle: 3500 });

  await ctx.line("open");
  await ctx.pause(300);
  await ctx.click(await latestSaleRow(page), { settle: 4500 });

  await ctx.line("receipt");
  await ctx.click(await topmost(page, L("View receipt"), "receipt"), { settle: 3500 });
  await ctx.click(await topmost(page, L("Close"), "close-receipt"), { settle: 1000 });
  // The sale window's own close is the X in its header.
  const x = L("Close").map((t) => `button[aria-label="${t}"]`).join(", ");
  await ctx.click(x, { settle: 1000 });

  await ctx.line("orders");
  await ctx.pause(400);
  // The Orders tab only shows in stores that take phone or online orders; point at the
  // Recent Sales tab it sits beside.
  await ctx.pointAt(await byTextStart(page, L("Recent Sales"), "button", "sales-tab"), { settle: 2000 });
  await ctx.finishSpeaking();
}
