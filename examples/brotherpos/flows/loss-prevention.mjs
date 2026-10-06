/** Loss Prevention: the review queue, one flag, a note, Mark reviewed. Setup rings a
 *  morning's sales, then (as the clerk) voids one and gives a big discount on another, and
 *  runs the scan that raises flags (normally a background job). */
import { execFileSync } from "child_process";
import { openAdmin, afterNav, navClick } from "../admin.mjs";
import { ringSomeSales } from "./_admin_common.mjs";
import { CONFIG } from "../config.mjs";

export const meta = { id: "loss-prevention", seed: ["--open-drawer", "--loss-prevention"], viewport: { width: 1600, height: 900 } };

const ACTIVITY = `
s = Store.find_by!(subdomain: ENV.fetch("SUB"))
ActsAsTenant.with_tenant(s) do
  clerk = User.find_by!(first_name: "Riley")
  sales = Sale.where(status: "completed").order(completed_at: :desc).to_a
  sales[0].void!(user: clerk, reason: nil, reason_code: "wrong_item")
  sales[1].update_columns(user_id: clerk.id, discount_amount: (sales[1].subtotal * 0.5).round(2), discount_type: "percentage", discount_value: 50)
  LossPrevention::ExceptionScanner.new(s).call
end
`;

export async function setup(ctx) {
  await ringSomeSales(ctx);
  execFileSync("docker", ["exec", "-e", `SUB=${CONFIG.subdomain}`, "pos_app", "bin/rails", "runner", ACTIVITY], { stdio: "ignore" });
  await openAdmin(ctx, { path: "/products" });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(1500);
  await navClick(ctx, "/admin/loss_prevention");
  await afterNav(ctx, { selector: 'main a[href^="/admin/loss_prevention/"]' });

  await ctx.line("queue");
  await ctx.pointAt('main table, main [class*="divide-y"]', { settle: 2500 });

  await ctx.line("view");
  const view = await page.evaluate(() => {
    const a = [...document.querySelectorAll('main a[href^="/admin/loss_prevention/"]')].find((x) => /\/admin\/loss_prevention\/\d+$/.test(x.getAttribute("href")) && x.offsetParent);
    a?.setAttribute("data-rec", "view");
    return !!a;
  });
  if (!view) throw new Error("no flag to view");
  await ctx.click('[data-rec="view"]', { settle: 500 });
  await afterNav(ctx, { selector: 'textarea[name="review_note"]' });
  await ctx.pause(2500);

  await ctx.line("note");
  await ctx.type('textarea[name="review_note"]', "Customer changed their mind; checked with Riley", { delay: 45, settle: 600 });

  await ctx.line("decide");
  await ctx.pointAt('form input[type="submit"][formaction$="/escalate"]', { settle: 1200 });
  await ctx.click('form input[type="submit"]:not([formaction])', { settle: 500 });
  await afterNav(ctx);
  await ctx.pause(1500);

  await ctx.line("innocent");
  await ctx.pause(2000);
  await ctx.finishSpeaking();
}
