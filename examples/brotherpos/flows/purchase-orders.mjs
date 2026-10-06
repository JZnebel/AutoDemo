/** Products -> More Actions -> Purchase Orders: order 24 gummies, then receive them. */
import { openAdmin, afterNav } from "../admin.mjs";

export const meta = { id: "purchase-orders", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

/** Tag the last visible element matching `css`. */
async function last(page, css, tag) {
  const ok = await page.evaluate((c, t) => {
    const el = [...document.querySelectorAll(c)].filter((x) => x.getBoundingClientRect().width > 0).pop();
    el?.setAttribute("data-rec", t);
    return !!el;
  }, css, tag);
  if (!ok) throw new Error(`nothing visible: ${css}`);
  return `[data-rec="${tag}"]`;
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(2600);
  await ctx.click('[data-tour="more-actions"] summary', { settle: 900 });
  await ctx.click('[data-tour="more-actions"] a[href="/admin/purchase_orders"]', { settle: 500 });
  await afterNav(ctx, { selector: 'a[href="/admin/purchase_orders/new"]' });

  await ctx.line("new");
  await ctx.click(await last(page, 'main a[href="/admin/purchase_orders/new"]', "new-po"), { settle: 500 });
  await afterNav(ctx, { selector: "#purchase_order_supplier_id" });
  await ctx.pointAt("#purchase_order_supplier_id", { settle: 1200 });

  await ctx.line("item");
  if (!(await page.evaluate(() => [...document.querySelectorAll(".po-product-search-input")].some((x) => x.getBoundingClientRect().width > 0)))) {
    await ctx.click('[data-action="purchase-order-form#addLineItem"]', { settle: 900 });
  }
  await ctx.type(await last(page, ".po-product-search-input", "po-search"), "Mango", { delay: 140, settle: 1200 });
  await ctx.click(await last(page, ".po-product-results [data-idx]", "po-result"), { settle: 900 });

  await ctx.line("qty");
  await ctx.type(await last(page, 'input[name$="[quantity]"]', "po-qty"), "24", { delay: 180, settle: 400 });
  await ctx.type(await last(page, 'input[name$="[unit_price]"]', "po-cost"), "12", { delay: 180, settle: 800 });

  await ctx.line("create");
  await ctx.click(await last(page, 'form input[type="submit"][name="commit"]', "po-create"), { settle: 500 });
  await afterNav(ctx, { selector: 'a[href$="/prepare_receiving"]' });
  await ctx.pause(1200);

  await ctx.line("receive");
  await ctx.click(await last(page, 'a[href$="/prepare_receiving"]', "po-receive"), { settle: 500 });
  await afterNav(ctx, { selector: "#complete_receiving_btn" });
  await ctx.pointAt(await last(page, 'input[name^="quantities_received"]', "po-received"), { settle: 2000 });

  await ctx.line("complete");
  await ctx.click("#complete_receiving_btn", { settle: 1000 });
  await ctx.click("#confirmation-modal-confirm-btn", { settle: 500 });
  await afterNav(ctx);
  const ok = await page.evaluate(async () => {
    const html = await (await fetch("/products?search=Mango", { headers: { Accept: "text/html" } })).text();
    return /\b6[34]\b/.test(html);
  });
  if (!ok) throw new Error("the stock didn't go up");
  await ctx.pause(1500);
  await ctx.finishSpeaking();
}
