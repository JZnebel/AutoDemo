/** Owner dashboard: pick 7 days, read the totals, compare the stores, Enter Store. */
import { openAdmin, afterNav, A } from "../admin.mjs";

export const meta = { id: "comparing-your-stores", seed: ["--second-store"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/owner" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(3500);

  await ctx.line("week");
  await ctx.pause(1200);
  await ctx.click('a.date-preset[href*="period=7d"]', { settle: 500 });
  await afterNav(ctx, { selector: "a.date-preset.active[href*='period=7d'], a.date-preset[href*='period=7d']" });
  if (!/period=7d/.test(page.url())) throw new Error("7 Days didn't apply");

  await ctx.line("totals");
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll("main .grid > div")].find((d) => /Net sales|Ventes nettes/i.test(d.innerText));
    cards?.parentElement?.setAttribute("data-rec", "totals");
  });
  await ctx.pointAt('[data-rec="totals"]', { settle: 4000 });

  await ctx.line("table");
  const found = await page.evaluate(() => {
    const h = [...document.querySelectorAll("main h2")].find((x) => /Store Performance|Performance des magasins/.test(x.innerText));
    const table = h?.closest("div")?.parentElement?.querySelector("table") || h?.parentElement?.parentElement?.querySelector("table");
    table?.setAttribute("data-rec", "stores");
    return !!table && (table.innerText.match(/Riverstone/g) || []).length >= 2;
  });
  if (!found) throw new Error("no Store Performance table with both stores");
  await ctx.reveal('[data-rec="stores"]', { block: 0.3, always: true });
  await ctx.pointAt('[data-rec="stores"] tbody tr', { settle: 3500 });

  await ctx.line("enter");
  await ctx.pointAt('[data-rec="stores"] tbody tr form button', { settle: 2500 });
  await ctx.finishSpeaking();
}
