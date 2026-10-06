/** Bar drinks, shot 3 of 3: selling a pour and a cocktail at the register. */
import { openRegister, byTextStart, productCard, L } from "../register.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "bar-drinks-register", viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) { await openRegister(ctx, { lang, who: "clerk" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(400);
  await ctx.line("pour");
  await ctx.click((await productCard(page, "Vodka 750ml")).sel, { settle: 1200 });
  const pour = await page.evaluate(() => {
    const el = [...document.querySelectorAll("button, [role=button], div.cursor-pointer")].filter((e) => e.offsetParent && /1[.,]5\s?oz/.test(e.innerText || "") && !/^\D*\d+\s*×/.test(e.innerText || ""))
      .sort((a, b) => a.innerText.length - b.innerText.length)[0];
    el?.setAttribute("data-rec", "pour");
    return !!el;
  });
  if (!pour) throw new Error("no 1.5 oz pour");
  await ctx.click('[data-rec="pour"]', { settle: 600 });
  await ctx.click(await byTextStart(page, L("Add"), "button", "add"), { settle: 1000 });
  await ctx.line("cocktail");
  await ctx.click((await productCard(page, "Screwdriver")).sel, { settle: 1200 });
  const add2 = await byTextStart(page, L("Add to Cart"), "button", "add2").catch(() => null);
  if (add2) await ctx.click(add2, { settle: 1000 });
  await ctx.expect(() => page.evaluate(() => /Screwdriver/.test(document.querySelector('[data-tour="cart-pane"]')?.innerText || "")), "the cocktail isn't in the cart");
  await ctx.line("tabs");
  await ctx.click(await byTextStart(page, L("Tabs"), "button", "tabs"), { settle: 900 });
  await ctx.click(await byTextStart(page, L("Save cart as tab"), "button", "savecart"), { settle: 700 });
  const nameBox = await page.evaluate((ph) => {
    const i = [...document.querySelectorAll("input")].find((x) => x.offsetParent && ph.includes(x.placeholder));
    i?.setAttribute("data-rec", "tabname");
    return !!i;
  }, L("Tab name (e.g. customer name)"));
  if (nameBox) await ctx.type('[data-rec="tabname"]', "Jamie", { delay: 110, settle: 400 });
  await ctx.click(await byTextStart(page, [...L("Save to tab"), ...L("Start tab")], "button", "savetab"), { settle: 1200 });
  await ctx.expect(async () => Number(railsRun(`puts TabItem.where.not(uom_level_id: nil).count`).trim()) > 0, "the pour didn't go on the tab");
  await ctx.line("later");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}
