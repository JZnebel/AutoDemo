/**
 * Making a sale, at the register: tap an item, flower by weight, search, quantity,
 * then cash with change. The store is fresh from seed.mjs --open-drawer.
 */
import { openRegister, productCard, byText } from "../register.mjs";

export const meta = {
  id: "making-a-sale",
  seed: ["--open-drawer"],
  viewport: { width: 1600, height: 900 },
};

export async function setup(ctx, { lang }) {
  await openRegister(ctx, { lang, who: "clerk" });
}

export async function run(ctx) {
  const { page } = ctx;

  await ctx.pause(600);
  await ctx.line("tap");
  await ctx.pause(1400);
  await ctx.click((await productCard(page, "House Pre-Roll 1g")).sel, { settle: 1500 });

  await ctx.line("flower");
  await ctx.pause(900);
  await ctx.click((await productCard(page, "Pink Kush (AAAA+)")).sel, { settle: 1600 });
  await ctx.pause(300);
  await ctx.click(await byText(page, ["3.5g (Eighth) 3.5g $30.00", "3.5g (Eighth) 3.5g 30,00 $"], "button.weight-preset-btn", "w35"), { settle: 1200 });

  await ctx.line("search");
  await ctx.pause(900);
  await ctx.type('[data-tour="product-search"] input, input[placeholder^="Search products"], input[placeholder^="Rechercher des produits"]', "gumm", { delay: 160, settle: 900 });
  const gummies = await productCard(page, "Mango Gummies 10mg x 10");
  await ctx.click(gummies.sel, { settle: 1200 });

  await ctx.line("qty");
  await ctx.pause(1200);
  await ctx.click(`[data-tour="qty-increase"][data-product-id="${gummies.id}"]`, { settle: 1000 });

  await ctx.line("total");
  await ctx.pause(700);
  await ctx.pointAt('[data-tour="cart-totals"]', { settle: 1800 });
  await ctx.click('[data-tour="tender-cash"]', { settle: 1200 });

  await ctx.line("tender");
  await ctx.pause(700);
  // The smallest quick-cash bill that covers the total, so there's change to give.
  const bill = await page.evaluate(() => {
    const norm = (s) => s.replace(/\s+/g, " ").trim();
    const due = Number((document.body.innerText.match(/(?:Total Due|Total dû)\s*\n?\s*\$?\s*([\d.,]+)/) || [])[1]?.replace(",", "."));
    const bills = [...document.querySelectorAll("button")]
      .map((b) => ({ b, v: Number(norm(b.innerText).replace(/[$\s]/g, "").replace(",", ".")) , t: norm(b.innerText) }))
      .filter((x) => /^\$?\d+( \$)?$/.test(x.t) && x.v >= 10);
    const pick = bills.filter((x) => x.v >= due).sort((a, b) => a.v - b.v)[0];
    if (!pick) return null;
    pick.b.setAttribute("data-rec", "bill");
    return pick.t;
  });
  if (!bill) throw new Error("no quick-cash bill covers the total");
  await ctx.click('[data-rec="bill"]', { settle: 1300 });
  await ctx.click(await byText(page, ["Complete Sale", "Compléter la vente"], "button", "complete"), { settle: 1500 });

  await ctx.line("change");
  await ctx.pause(400);
  await ctx.pointAt(await byText(page, ["Change Due", "Monnaie à rendre"], "p, div, span", "changebox"), { settle: 2200 });
  await ctx.click(await byText(page, ["Start New Sale", "Nouvelle vente"], "button", "newsale"), { settle: 600 });
  await ctx.finishSpeaking();
}
