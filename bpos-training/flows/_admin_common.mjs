/** Shared by the back-office flows. */
import { openRegister, quickSale } from "../register.mjs";

/** A morning's trade, rung through the register off camera, so reports have something in
 *  them. Mixed items, cash and card. */
export async function ringSomeSales(ctx) {
  await openRegister(ctx, { lang: "en" });
  const sales = [
    [["House Pre-Roll 1g", "Mango Gummies 10mg x 10"], "cash"],
    [["Pink Kush (AAAA+)"], "card"],
    [["Mixed Strain Pre-Roll Pack (5 x 0.5g)"], "cash"],
    [["Glass Hand Pipe", "Mango Gummies 10mg x 10"], "card"],
    [["Wedding Cake (AAA)", "House Pre-Roll 1g"], "cash"],
    [["GMO Live Resin 1g"], "card"],
  ];
  for (const [items, pay] of sales) await quickSale(ctx, items, { pay });
}

/** A product's edit page, found by name through the products search. */
export async function productEditPath(page, name) {
  const id = await page.evaluate(async (n) => {
    const html = await (await fetch(`/products?search=${encodeURIComponent(n)}`, { headers: { Accept: "text/html" } })).text();
    return (html.match(/\/products\/(\d+)\/edit/) || [])[1] || null;
  }, name);
  if (!id) throw new Error(`no product "${name}"`);
  return `/products/${id}/edit`;
}

/** The newest order paid with `pay` ("cash" or "card"), as an /orders/:id path. Reads the
 *  Orders list, so it needs the back office signed in. */
export async function newestOrderPath(page, pay = "cash") {
  const path = await page.evaluate(async (p) => {
    const html = await (await fetch("/orders", { headers: { Accept: "text/html" } })).text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const want = p === "card" ? /\b(Card|Carte|Debit|Débit)\b/i : /\b(Cash|Comptant|Espèces)\b/i;
    const row = [...doc.querySelectorAll('[data-tour="orders-table"] tr')].find((r) => want.test(r.textContent) && r.querySelector('a[href^="/orders/"]'));
    return row?.querySelector('a[href^="/orders/"]')?.getAttribute("href") || null;
  }, pay);
  if (!path) throw new Error(`no ${pay} order in the list`);
  return path;
}
