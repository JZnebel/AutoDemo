/** Products -> Categories -> New Category (Seeds), then More Actions -> Manage Brands ->
 *  a new brand. */
import { openAdmin, afterNav } from "../admin.mjs";

export const meta = { id: "categories-and-brands", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(2000);
  await ctx.click('main a.btn[href="/categories"]', { settle: 500 });
  await afterNav(ctx, { selector: 'a[href="/categories/new"]' });

  await ctx.line("new");
  await ctx.pause(400);
  await ctx.click('a[href="/categories/new"]', { settle: 500 });
  await page.waitForSelector("#category_name", { visible: true, timeout: 15000 });
  await ctx.settle();
  await ctx.type("#category_name", "Seeds", { delay: 110, settle: 600 });

  await ctx.line("parent");
  await ctx.pointAt("#category_parent_id", { settle: 2200 });

  await ctx.line("create");
  await ctx.click('form[action="/categories"] input[type="submit"]', { settle: 500 });
  await afterNav(ctx);
  // The starter catalog has no Seeds category, so it showing up means the save worked (a
  // name already in use comes back as an error on the form instead).
  if (await page.$("#category_name")) throw new Error("the category form came back with an error");
  const made = await page.evaluate(async () => />\s*Seeds\s*</.test(await (await fetch("/categories", { headers: { Accept: "text/html" } })).text()));
  if (!made) throw new Error("the category wasn't created");
  await ctx.pause(800);

  await ctx.line("brands");
  await ctx.pause(300);
  await page.goto(page.url().replace(/\/categories.*$/, "/products"), { waitUntil: "domcontentloaded" });
  await afterNav(ctx, { selector: '[data-tour="more-actions"] summary' });
  await ctx.click('[data-tour="more-actions"] summary', { settle: 900 });
  await ctx.click('[data-tour="more-actions"] a[href="/brands"]', { settle: 500 });
  await afterNav(ctx, { selector: 'a[href="/brands/new"]' });

  await ctx.line("brand");
  await ctx.click('main a[href="/brands/new"]', { settle: 500 });
  await afterNav(ctx, { selector: "#brand_name" });
  await ctx.type("#brand_name", "Northern Leaf", { delay: 110, settle: 500 });
  await ctx.click('form[action="/brands"] input[type="submit"]', { settle: 500 });
  await afterNav(ctx);

  await ctx.line("assign");
  await ctx.pause(1500);
  await ctx.finishSpeaking();
}
