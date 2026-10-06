/** Revenue centers: add one, put a register in it, give it its own categories. */
import { openAdmin, afterNav, navClick } from "../admin.mjs";
import { railsRun } from "./_admin_common.mjs";
import { BASE } from "../config.mjs";

export const meta = { id: "revenue-centers", seed: ["--week-of-sales"], viewport: { width: 1600, height: 900 }, worker1: true };

const SETUP = `
store.update!(feature_flags: store.feature_flags.merge("enable_revenue_centers" => true))
Register.create!(name: "Register 2", identifier: "REG-002") unless Register.exists?(identifier: "REG-002")
`;
const NAME = { en: "Lounge", fr: "Salon" };
let name = NAME.en;

export async function setup(ctx, { lang }) {
  name = NAME[lang] || NAME.en;
  railsRun(SETUP);
  await openAdmin(ctx, { path: "/products" });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("why");
  await ctx.pause(1500);

  await ctx.line("open");
  await navClick(ctx, "/cash_drawer_sessions");
  await afterNav(ctx, { selector: 'main a[href="/registers"]' });
  await ctx.click('main a[href="/registers"]', { settle: 500 });
  await afterNav(ctx, { selector: 'main a[href="/revenue_centers"]' });
  await ctx.click('main a[href="/revenue_centers"]', { settle: 500 });
  await afterNav(ctx, { selector: 'main a[href="/revenue_centers/new"]' });

  await ctx.line("add");
  await ctx.click('main a[href="/revenue_centers/new"]', { settle: 500 });
  await afterNav(ctx, { selector: "#revenue_center_name" });
  await ctx.type("#revenue_center_name", name, { delay: 110, settle: 400 });
  await ctx.click('form[action="/revenue_centers"] [type="submit"]', { settle: 600 });
  await afterNav(ctx);
  await ctx.expect(() => page.evaluate((n) => document.body.innerText.includes(n) && !location.pathname.endsWith("/new"), name), "the center wasn't added");

  await ctx.line("register");
  await ctx.goto(`${BASE}/registers`);
  await afterNav(ctx, { selector: 'main a[href$="/edit"]' });
  const edit = await page.evaluate(() => {
    const row = [...document.querySelectorAll("main tr, main li, main .dashboard-card")].find((r) => /Register 2/.test(r.innerText) && r.querySelector('a[href$="/edit"]'));
    row?.querySelector('a[href$="/edit"]')?.setAttribute("data-rec", "edit");
    return !!row;
  });
  if (!edit) throw new Error("no Register 2 to edit");
  await ctx.click('[data-rec="edit"]', { settle: 500 });
  await afterNav(ctx, { selector: "select#register_revenue_center_id" });
  const value = await page.$eval("select#register_revenue_center_id", (s, n) => [...s.options].find((o) => o.text.includes(n))?.value, name);
  await ctx.select("select#register_revenue_center_id", value, { settle: 600 });
  await ctx.click('form[action^="/registers/"] [type="submit"]', { settle: 600 });
  await afterNav(ctx);

  await ctx.line("categories");
  await ctx.pause(2500);

  await ctx.line("toggle");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}
