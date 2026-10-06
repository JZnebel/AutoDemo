/** A first look at the back office: dashboard, top menu, search, More Actions, your menu. */
import { openAdmin, afterNav, navClick } from "../admin.mjs";

export const meta = { id: "navigating-the-admin", seed: ["--week-of-sales"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/admin" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("dashboard");
  await ctx.pause(2500);

  await ctx.line("menu");
  await ctx.pointAt('nav a[href="/products"]', { settle: 700 });
  await ctx.pointAt('nav a[href="/orders"]', { settle: 700 });
  await ctx.pointAt('nav a[href="/reports"]', { settle: 700 });
  await ctx.pointAt('nav a[href="/store_settings"]', { settle: 900 });

  await ctx.line("search");
  const search = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button[data-action*="global-search#open"]')].find((x) => x.getBoundingClientRect().width > 0);
    b?.setAttribute("data-rec", "search");
    return !!b;
  });
  if (!search) throw new Error("no search button");
  await ctx.click('[data-rec="search"]', { settle: 500 });
  await ctx.type('[data-global-search-target="input"]', "Mango", { delay: 140, settle: 1500 });
  await page.keyboard.press("Escape");
  await ctx.pause(600);

  await ctx.line("more");
  await navClick(ctx, "/products");
  await afterNav(ctx, { selector: '[data-tour="more-actions"] > summary' });
  await ctx.click('[data-tour="more-actions"] > summary', { settle: 1500 });
  await ctx.click('[data-tour="more-actions"] > summary', { settle: 500 });

  await ctx.line("you");
  await ctx.click('[data-dropdown="user-menu"] > button', { settle: 2000 });
  await ctx.finishSpeaking();
}
