/** Cash Drawers -> a closed shift: its cash drops, payouts, the by-employee summary, and a
 *  deposit recorded after close. Setup rings a morning's sales, then (as the register would)
 *  a safe drop and a payout, and closes the shift as a shift change leaving a float. */
import { execFileSync } from "child_process";
import { openAdmin, afterNav } from "../admin.mjs";
import { ringSomeSales } from "./_admin_common.mjs";
import { CONFIG } from "../config.mjs";

export const meta = { id: "cash-drops-deposits", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

const ACTIVITY = `
s = Store.find_by!(subdomain: ENV.fetch("SUB"))
ActsAsTenant.with_tenant(s) do
  clerk = User.find_by!(first_name: "Riley"); mgr = User.find_by!(first_name: "Sam")
  session = CashDrawerSession.find_by!(status: "open")
  CashDrop.create!(cash_drawer_session: session, user: clerk, amount: 100, reason: "safe_drop", notes: "Midday safe drop")
  CashDrop.create!(cash_drawer_session: session, user: clerk, amount: 25, reason: "payout", notes: "Cleaning supplies")
  session.reload
  session.close!(session.calculate_expected_cash, closed_by: mgr, close_type: "shift", carryover_float: 150)
end
`;

export async function setup(ctx) {
  await ringSomeSales(ctx);
  execFileSync("docker", ["exec", "-e", `SUB=${CONFIG.subdomain}`, "pos_app", "bin/rails", "runner", ACTIVITY], { stdio: "ignore" });
  await openAdmin(ctx, { path: "/products" });
}

async function card(page, titles, tag) {
  const ok = await page.evaluate((w, t) => {
    // innerText follows CSS text-transform, and these titles are styled in capitals.
    const want = w.map((x) => x.toLowerCase());
    const h = [...document.querySelectorAll("main h3")].find((x) => want.includes(x.textContent.trim().toLowerCase()));
    const c = h?.closest(".dashboard-card");
    c?.setAttribute("data-rec", t);
    return !!c;
  }, titles, tag);
  if (!ok) throw new Error(`no card ${titles[0]}`);
  return `[data-rec="${tag}"]`;
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(1200);
  await ctx.click('nav a[href="/cash_drawer_sessions"]', { settle: 500 });
  await afterNav(ctx, { selector: '[data-tour="sessions-table"]' });
  const view = await page.evaluate(() => {
    const a = [...document.querySelectorAll('[data-tour="sessions-table"] a[href^="/cash_drawer_sessions/"]')].find((x) => /^\/cash_drawer_sessions\/\d+$/.test(x.getAttribute("href")));
    a?.setAttribute("data-rec", "view");
    return !!a;
  });
  if (!view) throw new Error("no View link");
  await ctx.click('[data-rec="view"]', { settle: 500 });
  await afterNav(ctx, { selector: '[data-tour="kpi-cards"]' });

  await ctx.line("drops");
  const drops = await card(page, ["Cash Drops", "Retraits de caisse"], "drops");
  await page.$eval(drops, (e) => e.scrollIntoView({ block: "center" }));
  await ctx.settle();
  await ctx.pointAt(`${drops} table`, { settle: 2500 });

  await ctx.line("payouts");
  const payouts = await card(page, ["Payouts by Type", "Décaissements par type"], "payouts");
  await page.$eval(payouts, (e) => e.scrollIntoView({ block: "center" }));
  await ctx.settle();
  await ctx.pointAt(payouts, { settle: 2200 });

  await ctx.line("summary");
  await page.evaluate(() => window.scrollTo(0, 0));
  await ctx.settle();
  await ctx.pointAt('main a[href$="/shift_summary"]', { settle: 2200 });

  await ctx.line("deposit");
  const dep = await card(page, ["Deposits After Close", "Dépôts après la fermeture"], "deposit");
  await page.$eval(dep, (e) => e.scrollIntoView({ block: "center" }));
  await ctx.settle();
  await ctx.type(`${dep} input[type="number"]`, "100", { delay: 200, settle: 400 });
  await ctx.type(`${dep} input[type="text"]`, "Taken to the safe", { delay: 70, settle: 500 });

  await ctx.line("record");
  await ctx.click(`${dep} input[type="submit"]`, { settle: 500 });
  await afterNav(ctx);
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}
