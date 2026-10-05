/** Reports -> Give-Away (Weigh-Heavy): free grams poured over the charged weight, and who
 *  weighs on the scale versus tapping presets. Setup turns a dozen of the seeded week's lines
 *  into weighed flower: Riley pours on the scale, a little heavy; Sam mostly taps presets. */
import { execFileSync } from "child_process";
import { openAdmin, afterNav } from "../admin.mjs";
import { CONFIG } from "../config.mjs";

export const meta = { id: "weigh-heavy-giveaway", seed: ["--second-store", "--scale"], viewport: { width: 1600, height: 900 } };

const POURS = `
s = Store.find_by!(subdomain: ENV.fetch("SUB"))
ActsAsTenant.with_tenant(s) do
  riley = User.find_by!(first_name: "Riley"); sam = User.find_by!(first_name: "Sam")
  flower = Product.find_by!(name: "House Special Flower (per-gram)")
  lines = Sale.where(status: "completed").order(completed_at: :desc).limit(14).filter_map { |sale| sale.sale_line_items.first }
  lines.each_with_index do |li, i|
    who = i.even? ? riley : sam
    li.sale.update_columns(user_id: who.id, completed_at: Time.current - (i * 25).minutes)
    charged = [3.5, 7.0, 3.5, 1.0][i % 4]
    poured = who == riley ? charged + [0.1, 0.2, 0.0, 0.3][i % 4] : charged + (i % 3 == 0 ? 0.4 : 0.0)
    source = who == riley ? "scale" : (i % 3 == 0 ? "scale" : "preset")
    li.update_columns(product_id: flower.id, quantity: charged, unit_price: flower.price, line_total: (charged * flower.price.to_f).round(2),
                      actual_weight_grams: poured, weight_source: source)
  end
end
`;

export async function setup(ctx) {
  execFileSync("docker", ["exec", "-e", `SUB=${CONFIG.subdomain}`, "pos_app", "bin/rails", "runner", POURS], { stdio: "ignore" });
  await openAdmin(ctx, { path: "/reports" });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(1500);
  await ctx.click('main a[href="/reports/give_away"]', { settle: 500 });
  await afterNav(ctx, { selector: "main table" });

  await ctx.line("total");
  await ctx.pause(2500);

  await ctx.line("scale");
  const scale = await page.evaluate(() => {
    const t = document.querySelector("main table");
    const card = t?.parentElement?.closest("div:has(h3)");
    (card || t)?.setAttribute("data-rec", "usage");
    return !!t;
  });
  if (!scale) throw new Error("no scale usage table");
  await ctx.pointAt('[data-rec="usage"]', { settle: 3500 });

  await ctx.line("pours");
  await page.evaluate(() => [...document.querySelectorAll("main table")].pop()?.scrollIntoView({ block: "center" }));
  await ctx.settle();
  await ctx.pause(3000);
  await ctx.finishSpeaking();
}
