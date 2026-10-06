/** $60 split: $20 cash, the rest on card. */
import { openRegister, byText, addToCart, L } from "../register.mjs";

export const meta = { id: "split-payment", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) {
  await openRegister(ctx, { lang });
  await addToCart(ctx.page, ["Mixed Strain Pre-Roll Pack (5 x 0.5g)", "Mango Gummies 10mg x 10"]);
  await ctx.pause(2500);
}

/** The last visible button with one of these labels (the split window repeats labels). */
const last = (page, texts, tag) => page.evaluate((w, t) => {
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  const b = [...document.querySelectorAll("button")].filter((e) => w.includes(norm(e.innerText)) && e.getBoundingClientRect().width > 0).pop();
  if (!b) return null;
  b.setAttribute("data-rec", t);
  return `[data-rec="${t}"]`;
}, texts, tag);

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(1300);
  await ctx.click(await byText(page, L("Split Payment"), "button", "split"), { settle: 1300 });

  await ctx.line("cash");
  await ctx.pause(1500);
  await ctx.click(await last(page, ["$20", "20 $"], "b20"), { settle: 700 });
  await ctx.click(await last(page, L("Add Payment"), "add1"), { settle: 1300 });

  await ctx.line("card");
  await ctx.pause(300);
  await ctx.click(await last(page, L("Card"), "card"), { settle: 700 });
  await ctx.click(await last(page, L("Remaining"), "remaining"), { settle: 700 });
  await ctx.click(await last(page, L("Add Payment"), "add2"), { settle: 1300 });

  await ctx.line("done");
  await ctx.pause(800);
  await ctx.click(await last(page, L("Complete Sale"), "complete"), { settle: 2200 });
  await ctx.finishSpeaking();
}
