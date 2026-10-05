/** Reports -> Receiving Variance: ordered vs billed vs arrived, the totals, Export CSV. */
import { openAdmin, afterNav } from "../admin.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "receiving-variance", seed: [], viewport: { width: 1600, height: 900 } };

const ORDERS = `
sup = Supplier.find_or_create_by!(name: "Great North Distribution")
p = ->(n) { Product.find_by!(name: n) }
po = PurchaseOrder.create!(supplier: sup, order_number: "PO-#{Date.current.strftime('%m%d')}-07", status: :partially_received, ordered_at: 3.days.ago,
                           subtotal: 800, tax_amount: 0, total: 800, created_at: 2.days.ago)
li = ->(prod, attrs) { po.line_items.create!({ product: prod, store_id: store.id, unit_price: 18, line_total: 18 * attrs[:quantity].to_f }.merge(attrs)) }
li.(p.("Pink Kush (AAAA+)"), quantity: 24, quantity_invoiced: 24, unit_cost_invoiced: 18, quantity_received: 20, variance_status: "short")
li.(p.("House Pre-Roll 1g"), quantity: 10, quantity_invoiced: 10, unit_cost_invoiced: 3, unit_price: 3, line_total: 30, quantity_received: 12, variance_status: "over")
li.(p.("Glass Hand Pipe"), quantity: 0, unit_price: 8, line_total: 0, quantity_received: 3, variance_status: "unexpected")
li.(p.("Mango Gummies 10mg x 10"), quantity: 8, quantity_invoiced: 8, unit_cost_invoiced: 10, unit_price: 10, line_total: 80, quantity_received: 0, variance_status: "pending")
li.(p.("Wedding Cake (AAA)"), quantity: 12, quantity_invoiced: 12, unit_cost_invoiced: 14, unit_price: 14, line_total: 168, quantity_received: 12, variance_status: "ok")
`;

export async function setup(ctx) {
  railsRun(ORDERS);
  await openAdmin(ctx, { path: "/reports" });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("why");
  await ctx.pause(1500);

  await ctx.line("open");
  await ctx.click('main a.action-card[href="/reports/receiving_variance"]', { settle: 500 });
  await afterNav(ctx, { selector: "main .stat-card" });

  await ctx.line("boxes");
  await ctx.pointAt("main .stat-card", { settle: 2500 });

  await ctx.line("rows");
  await ctx.reveal("main table tbody tr");
  await ctx.expect(() => page.evaluate(() => /Pink Kush/.test(document.querySelector("main table")?.innerText || "")), "no variance rows");
  await ctx.pointAt("main table tbody tr", { settle: 3000 });

  await ctx.line("export");
  await ctx.pointAt('main a[href^="/reports/receiving_variance_csv"]', { settle: 2000 });
  await ctx.finishSpeaking();
}
