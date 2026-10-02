/** Cash Drawers: view today's open drawer, then close it from the back office (someone left
 *  it open). */
import { openAdmin, afterNav } from "../admin.mjs";
import { ringSomeSales } from "./_admin_common.mjs";

export const meta = { id: "cash-sessions", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) {
  await ringSomeSales(ctx);
  await openAdmin(ctx, { path: "/products" });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(1200);
  await ctx.click('nav a[href="/cash_drawer_sessions"]', { settle: 500 });
  await afterNav(ctx, { selector: '[data-tour="sessions-table"]' });

  await ctx.line("list");
  await ctx.pointAt('[data-tour="sessions-table"]', { settle: 2200 });

  await ctx.line("view");
  const view = await page.evaluate(() => {
    const a = [...document.querySelectorAll('[data-tour="sessions-table"] a[href^="/cash_drawer_sessions/"]')].find((x) => /^\/cash_drawer_sessions\/\d+$/.test(x.getAttribute("href")));
    a?.setAttribute("data-rec", "view");
    return !!a;
  });
  if (!view) throw new Error("no View link");
  await ctx.click('[data-rec="view"]', { settle: 500 });
  await afterNav(ctx, { selector: '[data-tour="kpi-cards"]' });
  await ctx.pointAt('[data-tour="kpi-cards"]', { settle: 2500 });

  await ctx.line("left-open");
  await ctx.click('main a[href$="/close"]', { settle: 500 });
  await afterNav(ctx, { selector: "#actual_cash" });
  const expected = await page.evaluate(() => {
    const span = [...document.querySelectorAll("main span.font-bold")].find((s) => /\d/.test(s.innerText));
    return span ? span.innerText.replace(/[^\d.,]/g, "").replace(/\s/g, "") : null;
  });
  if (!expected) throw new Error("no expected cash");
  const amount = expected.includes(",") && !expected.includes(".") ? expected.replace(",", ".") : expected.replace(/,/g, "");

  await ctx.line("count");
  await ctx.type("#actual_cash", amount, { delay: 160, settle: 400 });
  await ctx.type("#notes", "Left open overnight", { delay: 70, settle: 700 });

  await ctx.line("close");
  await ctx.click('form[action$="/finalize_close"] input[type="submit"]', { settle: 500 });
  await afterNav(ctx);
  if (await page.$("#actual_cash")) throw new Error("the close form came back with an error");
  await ctx.pause(1200);
  await ctx.pointAt('[data-tour="kpi-cards"], main', { settle: 2000 });
  await ctx.finishSpeaking();
}
