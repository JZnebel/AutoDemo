/** Bar drinks, shot 2 of 3: a cocktail from the Cocktail Library. */
import { openAdmin, afterNav } from "../admin.mjs";
import { railsRun } from "./_admin_common.mjs";

export const meta = { id: "bar-drinks-cocktail", viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(400);
  await ctx.line("library");
  await ctx.click('main a[href="/drink_library"]', { settle: 700 });
  await afterNav(ctx, { selector: 'main a[href*="/drink_library/"][href$="/configure"]' });
  const add = await page.evaluate(() => {
    const card = [...document.querySelectorAll("main a[href$='/configure']")].map((a) => a.closest("div")).find((c) => /Screwdriver/.test(c?.closest("[class*=rounded]")?.innerText || c?.innerText || ""));
    const a = card?.closest("[class*=rounded]")?.querySelector("a[href$='/configure']") || card?.querySelector("a[href$='/configure']");
    a?.setAttribute("data-rec", "add");
    return !!a;
  });
  if (!add) throw new Error("no Screwdriver in the library");
  await ctx.reveal('[data-rec="add"]', { always: true });
  await ctx.line("can");
  await ctx.click('[data-rec="add"]', { settle: 700 });
  await afterNav(ctx, { selector: 'input[name="price"]' });
  await ctx.line("price");
  await page.$eval('input[name="price"]', (e) => { e.value = ""; });
  await ctx.type('input[name="price"]', "9", { delay: 150, settle: 300 });
  const cat = await page.$eval('select[name="category_id"]', (s) => [...s.options].find((o) => /bar/i.test(o.textContent))?.value || s.value);
  await ctx.select('select[name="category_id"]', cat, { settle: 400 });
  await ctx.click('form [type="submit"][name="commit"], form input[type="submit"]', { settle: 900 });
  await afterNav(ctx);
  await ctx.expect(async () => /Screwdriver/.test(railsRun(`puts Product.where(is_drink: true).pluck(:name).join(",")`)), "the cocktail wasn't added");
  await ctx.finishSpeaking();
}
