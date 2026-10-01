/** A return from the sale itself (Recent Sales -> the sale -> Return items). */
import { openRegister, byText, quickSale, latestSaleRow, L } from "../register.mjs";

export const meta = { id: "returns", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) {
  await openRegister(ctx, { lang });
  await quickSale(ctx, ["Mango Gummies 10mg x 10", "House Pre-Roll 1g"]);
  await ctx.pause(2500);
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("find");
  await ctx.pause(2500);
  await ctx.click(await latestSaleRow(page), { settle: 1500 });

  await ctx.line("start");
  await ctx.click('[data-testid="return-items-button"]', { settle: 1800 });

  await ctx.line("items");
  await ctx.pause(300);
  const box = await page.evaluate(() => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const row = [...document.querySelectorAll("label, div")].filter((e) => norm(e.innerText).startsWith("Mango Gummies") && e.querySelector('input[type="checkbox"]')).pop();
    const cb = row?.querySelector('input[type="checkbox"]');
    if (!cb) return null;
    cb.setAttribute("data-rec", "gummies");
    return '[data-rec="gummies"]';
  });
  if (!box) throw new Error("no return line for the gummies");
  await ctx.click(box, { settle: 800 });
  await ctx.click(await byText(page, L("Continue"), "button", "continue"), { settle: 1500 });

  await ctx.line("method");
  await ctx.pause(1500);
  await ctx.pointAt(".fixed select, [role=\"dialog\"] select", { settle: 1500 });
  await ctx.pointAt(await byText(page, L("Restock returned items"), "label, span", "restock"), { settle: 1200 });

  await ctx.line("process");
  await ctx.pause(300);
  const proc = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].filter((e) => /^(Process Return|Traiter (un|le) retour)/.test((e.innerText || "").trim())).pop();
    b?.setAttribute("data-rec", "process");
    return !!b;
  });
  if (!proc) throw new Error("no Process Return button");
  await ctx.click('[data-rec="process"]', { settle: 2500 });
  await ctx.click(await byText(page, L("Done"), "button", "done"), { settle: 800 });
  await ctx.finishSpeaking();
}
