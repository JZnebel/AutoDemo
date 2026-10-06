/** Orders -> Online Orders: what's waiting, Mark Ready, then Complete Order with payment. */
import { openAdmin, afterNav, navClick } from "../admin.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "online-orders-admin", seed: ["--online-orders", "--open-drawer"], viewport: { width: 1600, height: 900 } };

const ORDERS = `
mk = ->(who, prod, qty, status, note) {
  c = Customer.find_by!(name: who); p = Product.find_by!(name: prod); t = p.price * qty
  Sale.create!(source: "online", status: status, customer: c, payment_method: "cash", fulfillment_method: "pickup",
               subtotal: t, tax_amount: 0, total: t, notes: note,
               sale_line_items_attributes: [{ product: p, quantity: qty, unit_price: p.price, line_total: t }])
}
mk.("Jamie Morin", "Mango Gummies 10mg x 10", 2, "pending", ENV.fetch("NOTE"))
mk.("Alex Bouchard", "House Pre-Roll 1g", 3, "pending", nil)
mk.("Dana Whitfield", "Glass Hand Pipe", 1, "ready", nil)
`;
const NOTE = { en: "Picking up after work", fr: "Je passe après le travail" };

export async function setup(ctx, { lang }) {
  railsRun(ORDERS, { NOTE: NOTE[lang] || NOTE.en });
  await openAdmin(ctx, { path: "/products" });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await navClick(ctx, "/orders");
  await afterNav(ctx, { selector: 'main a[href="/admin/storefront_orders"]' });
  await ctx.click('main a[href="/admin/storefront_orders"]', { settle: 500 });
  await afterNav(ctx, { selector: 'main a[href^="/admin/storefront_orders/"]' });

  await ctx.line("filter");
  await ctx.click('main a[href*="status=pending"]', { settle: 500 });
  await afterNav(ctx, { selector: 'main a[href^="/admin/storefront_orders/"]' });
  await ctx.pause(1200);

  await ctx.line("ready");
  const order = await page.evaluate(() => {
    const a = [...document.querySelectorAll('main a[href^="/admin/storefront_orders/"]')].find((x) => /Jamie/.test(x.innerText) && /\/\d+$/.test(x.getAttribute("href")));
    a?.setAttribute("data-rec", "order");
    return !!a;
  });
  if (!order) throw new Error("no order for Jamie");
  await ctx.click('[data-rec="order"]', { settle: 500 });
  await afterNav(ctx, { selector: 'form[action$="/mark_ready"]' });
  await ctx.click('form[action$="/mark_ready"] [type="submit"], form[action$="/mark_ready"] button', { settle: 600 });
  await afterNav(ctx);
  await ctx.expect(() => page.evaluate(() => !document.querySelector('form[action$="/mark_ready"]')), "the order wasn't marked ready");

  await ctx.line("complete");
  await ctx.click('#complete-order > button[data-action="click->modal#open"]', { settle: 800 });
  await page.waitForSelector("#complete-order-form", { visible: true, timeout: 10000 });
  await ctx.click('#complete-order-form input[name="payment_method"][value="cash"]', { settle: 500 });
  await ctx.click('#complete-order-form [type="submit"]', { settle: 800 });
  await afterNav(ctx);
  await ctx.pause(1500);

  await ctx.line("cancel");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}
