/** Owner -> Customers: share customers between stores, pick the loyalty program, combine
 *  the same person's two accounts. */
import { openAdmin, afterNav } from "../admin.mjs";
import { execFileSync } from "child_process";
import { CONFIG } from "../config.mjs";

export const meta = { id: "customer-sharing", seed: ["--second-store"], viewport: { width: 1600, height: 900 }, worker1: true };

const WEST = `
west = Store.find_by!(subdomain: ENV.fetch("SUB") + "-west")
ActsAsTenant.with_tenant(west) do
  Customer.create!(name: "Jamie Morin", phone: "705-555-0142", loyalty_points: 30)
  Customer.create!(name: "Taylor Brooks", phone: "705-555-0199")
end
`;

export async function setup(ctx) {
  execFileSync("docker", ["exec", "-e", `SUB=${CONFIG.subdomain}`, "pos_app", "bin/rails", "runner", WEST], { stdio: "ignore" });
  await openAdmin(ctx, { path: "/owner" });
  await ctx.page.waitForSelector('main a[href="/owner/customer_sharing"], nav a[href="/owner/customer_sharing"], a[href="/owner/customer_sharing"]', { timeout: 90000 });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("why");
  await ctx.pause(1500);

  await ctx.line("open");
  await ctx.click('a[href="/owner/customer_sharing"]', { settle: 500 });
  await afterNav(ctx, { selector: 'input[name="store_ids[]"]' });
  const boxes = await page.$$('input[name="store_ids[]"]');
  for (let i = 0; i < boxes.length; i++) {
    await page.$$eval('input[name="store_ids[]"]', (els) => els.forEach((e, k) => e.setAttribute("data-rec", `store${k}`)));
    if (!(await page.$eval(`[data-rec="store${i}"]`, (e) => e.checked))) await ctx.click(`[data-rec="store${i}"]`, { settle: 400 });
  }

  await ctx.line("loyalty");
  await ctx.pointAt("select#loyalty_from", { settle: 1200 });
  await ctx.click('form[action="/owner/customer_sharing"] [type="submit"]', { settle: 600 });
  await afterNav(ctx);
  await ctx.pause(1200);

  await ctx.line("combine");
  await ctx.reveal('form[action="/owner/customer_sharing/combine"]', { always: true });
  await ctx.pointAt('form[action="/owner/customer_sharing/combine"] button', { settle: 2500 });

  await ctx.line("settle");
  await ctx.reveal('form[action="/owner/customer_sharing/new_codes"]').catch(() => {});
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}
