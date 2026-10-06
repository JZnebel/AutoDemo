/** Reports -> Voids & Discounts: who voided and discounted what, and who approved it. The
 *  morning's sales are rung on the register off camera; then, as the clerk, one is voided
 *  and two get discounts (one approved by the manager). */
import { execFileSync } from "child_process";
import { openAdmin, afterNav } from "../admin.mjs";
import { ringSomeSales } from "./_admin_common.mjs";
import { CONFIG } from "../config.mjs";

export const meta = { id: "voids-discounts-report", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

const ACTIVITY = `
s = Store.find_by!(subdomain: ENV.fetch("SUB"))
ActsAsTenant.with_tenant(s) do
  clerk = User.find_by!(first_name: "Riley"); mgr = User.find_by!(first_name: "Sam")
  sales = Sale.where(status: "completed").order(completed_at: :desc).to_a
  sales[0].void!(user: clerk, reason: nil, reason_code: "wrong_item")
  sales[1].update_columns(user_id: clerk.id, discount_amount: (sales[1].subtotal * 0.1).round(2), discount_type: "percentage", discount_value: 10, discount_reason: "Senior Discount")
  sales[2].update_columns(user_id: clerk.id, discount_amount: 5, discount_type: "fixed", discount_value: 5, discount_reason_code: "damaged", discount_authorized_by_id: mgr.id)
end
`;

export async function setup(ctx) {
  await ringSomeSales(ctx);
  execFileSync("docker", ["exec", "-e", `SUB=${CONFIG.subdomain}`, "pos_app", "bin/rails", "runner", ACTIVITY], { stdio: "ignore" });
  await openAdmin(ctx, { path: "/reports" });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("why");
  await ctx.pause(2500);

  await ctx.line("open");
  await ctx.click('[data-tour="report-voids-discounts"]', { settle: 500 });
  await afterNav(ctx, { selector: '[data-tour="voids-discounts-summary"]' });
  await ctx.pointAt('[data-tour="voids-discounts-summary"]', { settle: 1800 });

  await ctx.line("staff");
  await ctx.reveal('[data-tour="voids-discounts-by-staff"]');
  await ctx.pointAt('[data-tour="voids-discounts-by-staff"]', { settle: 2500 });

  await ctx.line("list");
  await page.evaluate(() => document.querySelector('[data-tour="voids-discounts-voids"]').scrollIntoView({ block: "start" }));
  await ctx.settle();
  await ctx.pointAt('[data-tour="voids-discounts-voids"] tbody tr', { settle: 2500 });

  await ctx.line("approved");
  await ctx.pointAt('[data-tour="voids-discounts-discounts"]', { settle: 2500 });

  await ctx.line("owner");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}
