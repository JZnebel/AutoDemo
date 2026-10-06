/** Product -> Inventory: reserved vs available stock, and the holds behind it. */
import { openAdmin, goAdmin } from "../admin.mjs";
import { railsRun, productEditPath } from "./_admin_common.mjs";

export const meta = { id: "stock-reservations", seed: ["--online-orders"], viewport: { width: 1600, height: 900 } };

const HOLDS = `
p = Product.find_by!(name: "Mango Gummies 10mg x 10")
c = Customer.find_by!(name: "Jamie Morin")
Sale.create!(source: "online", status: "pending", customer: c, payment_method: "cash", fulfillment_method: "pickup",
             subtotal: p.price * 2, tax_amount: 0, total: p.price * 2,
             sale_line_items_attributes: [{ product: p, quantity: 2, unit_price: p.price, line_total: p.price * 2 }])
StockReservation.create!(product: p, quantity: 1, source_type: "HeldOrder", source_id: "H-1001", expires_at: 24.hours.from_now)
`;

export async function setup(ctx) {
  railsRun(HOLDS);
  await openAdmin(ctx, { path: "/products" });
  await goAdmin(ctx, await productEditPath(ctx.page, "Mango Gummies 10mg x 10"));
}

export async function run(ctx) {
  await ctx.pause(500);
  await ctx.line("why");
  await ctx.pause(2000);

  await ctx.line("open");
  await ctx.click('button[data-product-tabs-target="tab"][data-tab="inventory"]', { settle: 900 });

  await ctx.line("numbers");
  await ctx.expect(() => ctx.page.evaluate(() => !!document.querySelector('[data-tab-panel="inventory"] details, details')), "no reservations on the product");
  const boxes = await ctx.page.evaluate(() => {
    const el = [...document.querySelectorAll("main *")].find((e) => e.children.length < 3 && /Reserved|Réservé|Reservado/.test(e.textContent) && e.getBoundingClientRect().width > 0);
    const card = el?.closest("div.grid, .dashboard-card, section");
    card?.setAttribute("data-rec", "stock");
    return !!card;
  });
  if (boxes) await ctx.pointAt('[data-rec="stock"]', { settle: 3000 });
  else await ctx.pause(3000);

  await ctx.line("list");
  await ctx.reveal("main details table", { always: true });
  await ctx.pointAt("main details table tbody tr", { settle: 2500 });

  await ctx.line("free");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}
