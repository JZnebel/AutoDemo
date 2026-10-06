/** Storefront -> Abandoned Carts: carts left at checkout, the reminder, what came back. */
import { openAdmin, afterNav } from "../admin.mjs";
import { railsRun } from "./_admin_common.mjs";
import { openStorefront } from "./_storefront_common.mjs";

export const meta = { id: "abandoned-carts", seed: ["--storefront"], viewport: { width: 1600, height: 900 }, worker1: true };

const CARTS = `
mk = ->(who, email, prod, qty, hours, notified, recovered) {
  p = Product.find_by!(name: prod); c = Customer.find_by(name: who)
  AbandonedCart.create!(email: email, customer: c, cart_total: p.price * qty, item_count: qty,
    cart_data: { p.id.to_s => { "product_id" => p.id, "quantity" => qty, "product_name" => p.name } },
    notified_at: (notified ? (hours - 1).hours.ago : nil), recovered: recovered, recovered_at: (recovered ? (hours - 2).hours.ago : nil),
    created_at: hours.hours.ago)
}
mk.("Jamie Morin", "jamie@example.com", "Mango Gummies 10mg x 10", 2, 30, true, true)
mk.("Dana Whitfield", "dana@example.com", "House Pre-Roll 1g", 4, 20, true, false)
mk.("Pat Lee", "pat@example.com", "Glass Hand Pipe", 1, 6, true, true)
mk.("Alex Bouchard", "alex@example.com", "Live Resin 510 Cart 0.5g", 1, 3, true, false)
mk.(nil, "visitor@example.com", "House Pre-Roll 1g", 2, 0.3, false, false)
`;

export async function setup(ctx) {
  railsRun(CARTS);
  await openAdmin(ctx, { path: "/products" });
}

export async function run(ctx) {
  await ctx.pause(500);
  await ctx.line("why");
  await ctx.pause(1500);
  await ctx.line("open");
  await openStorefront(ctx);
  await ctx.click('main a[href="/admin/abandoned_carts"]', { settle: 500 });
  await afterNav(ctx, { selector: "main table" });
  await ctx.line("email");
  await ctx.pause(2500);
  await ctx.line("tiles");
  await ctx.pointAt("main .grid", { settle: 2500 });
  await ctx.line("status");
  await ctx.pointAt("main table tbody tr", { settle: 3000 });
  await ctx.line("nothing");
  await ctx.pause(2000);
  await ctx.finishSpeaking();
}
