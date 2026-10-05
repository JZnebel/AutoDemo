/** Reports -> Customer Analytics, over a week of sales with the demo customers on them. */
import { execFileSync } from "child_process";
import { openAdmin, afterNav } from "../admin.mjs";
import { CONFIG } from "../config.mjs";

export const meta = { id: "customer-analytics", seed: ["--second-store"], viewport: { width: 1600, height: 900 } };

// Put the demo customers on the week's sales: Jamie on the most, so there's a clear top
// customer, and a few walk-ins left without one.
const CUSTOMERS = `
s = Store.find_by!(subdomain: ENV.fetch("SUB"))
ActsAsTenant.with_tenant(s) do
  people = Customer.order(:id).to_a
  weights = { "Jamie Morin" => 5, "Dana Whitfield" => 3, "Alex Bouchard" => 2, "Pat Lee" => 2, "Chris Martin" => 1 }
  pool = people.flat_map { |c| [c] * (weights[c.name] || 1) }
  Sale.where(status: "completed").order(:completed_at).each_with_index do |sale, i|
    next if i % 5 == 4
    sale.update_columns(customer_id: pool[i % pool.size].id)
  end
end
`;

export async function setup(ctx) {
  execFileSync("docker", ["exec", "-e", `SUB=${CONFIG.subdomain}`, "pos_app", "bin/rails", "runner", CUSTOMERS], { stdio: "ignore" });
  await openAdmin(ctx, { path: "/reports" });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(1500);
  await ctx.click('[data-tour="report-customers"]', { settle: 500 });
  await afterNav(ctx, { selector: '[data-tour="customer-summary-cards"]' });

  await ctx.line("cards");
  await ctx.pointAt('[data-tour="customer-summary-cards"]', { settle: 3000 });

  await ctx.line("top");
  await page.$eval('[data-tour="top-customers"]', (e) => e.scrollIntoView({ block: "start" }));
  await ctx.settle();
  await ctx.pointAt('[data-tour="top-customers"] tbody tr', { settle: 3000 });

  await ctx.line("lists");
  await page.$eval('[data-tour="at-risk-customers"], [data-tour="loyal-customers"]', (e) => e.scrollIntoView({ block: "start" }));
  await ctx.settle();
  await ctx.pause(2500);

  await ctx.line("tip");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}
