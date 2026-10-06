/** Who did what: Reports -> Audit Trail (field changes, View, Undo), then Activity Logs
 *  through the search (sign-ins, voids, critical events). */
import { openAdmin, afterNav } from "../admin.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "activity-audit", seed: ["--week-of-sales"], viewport: { width: 1600, height: 900 } };

// The seed's own records show as "System"; clear them, then make a few changes the way staff
// would, with their names on them.
const HISTORY = `
ActivityLog.where(user_id: nil).delete_all
PaperTrail::Version.where(store_id: store.id, whodunnit: nil).delete_all if PaperTrail::Version.column_names.include?("store_id")
sam = User.find_by!(first_name: "Sam"); riley = User.find_by!(first_name: "Riley")
who = ->(u) { "#{u.email} (id:#{u.id})" }
as = ->(u, &blk) { Current.set(user: u) { PaperTrail.request(whodunnit: who.(u)) { blk.call } } }
as.(sam) { Product.find_by!(name: "Mango Gummies 10mg x 10").update!(price: 27) }
as.(sam) { Product.find_by!(name: "Glass Hand Pipe").update!(price: 24) }
ActivityLog.log_activity(action: "login", trackable: riley, user: riley, description: "login — #{riley.email}")
sale = Sale.where(status: "completed").order(completed_at: :desc).first
as.(sam) { sale.void!(user: sam, reason: ENV.fetch("WHY")) } if sale
`;
const WHY = { en: "Customer changed their mind", fr: "Le client a changé d'avis" };

export async function setup(ctx, { lang }) {
  railsRun(HISTORY, { WHY: WHY[lang] || WHY.en });
  await openAdmin(ctx, { path: "/reports" });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.click('main [data-tour="report-audit"]', { settle: 500 });
  await afterNav(ctx, { selector: "main table" });

  await ctx.line("rows");
  await ctx.select('select[name="item_type"]', "Product", { settle: 500 });
  const apply = await page.evaluate(() => {
    const b = document.querySelector('select[name="item_type"]')?.closest("form")?.querySelector('[type="submit"]');
    b?.setAttribute("data-rec", "apply");
    return !!b;
  });
  if (!apply) throw new Error("no Apply Filters");
  await ctx.click('[data-rec="apply"]', { settle: 500 });
  await afterNav(ctx, { selector: "main table" });
  await ctx.pointAt("main table tbody tr", { settle: 1500 });

  await ctx.line("view");
  // A price change (the void also logs a stock row; a price reads better).
  const row = await page.evaluate(() => {
    const tr = [...document.querySelectorAll("main table tbody tr")].find((r) => /Mango/.test(r.innerText));
    const a = tr?.querySelector('a[href^="/admin/audit_trail/"]');
    a?.setAttribute("data-rec", "view");
    return !!a;
  });
  if (!row) throw new Error("no Mango price change in the audit trail");
  await ctx.click('[data-rec="view"]', { settle: 500 });
  await afterNav(ctx, { selector: "main" });
  await ctx.pause(2500);

  await ctx.line("undo");
  await ctx.pointAt('form[action$="/undo"] [type="submit"], form[action$="/undo"] button', { settle: 2000 }).catch(() => ctx.pause(2000));

  await ctx.line("logs");
  const search = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button[data-action*="global-search#open"]')].find((x) => x.getBoundingClientRect().width > 0);
    b?.setAttribute("data-rec", "search");
    return !!b;
  });
  if (!search) throw new Error("no search button");
  await ctx.click('[data-rec="search"]', { settle: 500 });
  await ctx.type('[data-global-search-target="input"]', "Activ", { delay: 140, settle: 800 });
  await ctx.click('[data-global-search-target="pageResults"] a[href="/admin/activity_logs"]', { settle: 500 });
  await afterNav(ctx, { selector: "main table" });

  await ctx.line("critical");
  await ctx.select('select[name="severity"]', "critical", { settle: 500 });
  const filter = await page.evaluate(() => {
    const b = document.querySelector('select[name="severity"]')?.closest("form")?.querySelector('[type="submit"]');
    b?.setAttribute("data-rec", "filter");
    return !!b;
  });
  if (!filter) throw new Error("no Filter button");
  await ctx.click('[data-rec="filter"]', { settle: 500 });
  await afterNav(ctx, { selector: "main table" });
  await ctx.pointAt("main table tbody tr", { settle: 2500 });
  await ctx.finishSpeaking();
}
