/** Find a product, open it, change the price on the Pricing tab, save. */
import { openAdmin, afterNav } from "../admin.mjs";

export const meta = { id: "changing-a-price", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("find");
  await ctx.pause(1500);
  const search = 'main input[type="search"], main input[name="search"], main input[placeholder^="Search"], main input[placeholder^="Rechercher"]';
  await ctx.type(search, "House Pre-Roll", { delay: 110, settle: 300 });
  await page.keyboard.press("Enter");
  await afterNav(ctx);
  await ctx.pause(800);

  await ctx.line("edit");
  const edit = await page.evaluate(() => {
    const a = [...document.querySelectorAll('main a[href$="/edit"]')].find((x) => x.getBoundingClientRect().width > 0 && /\/products\/\d+\/edit$/.test(x.getAttribute("href")));
    a?.setAttribute("data-rec", "edit");
    return !!a;
  });
  if (!edit) throw new Error("no Edit link");
  await ctx.click('[data-rec="edit"]', { settle: 600 });
  await afterNav(ctx, { selector: '#product-edit-form' });

  await ctx.line("price");
  await ctx.pause(300);
  await ctx.click('[role="tab"][data-tab="pricing"]', { settle: 1000 });
  await ctx.type('#product-edit-form [name="product[price]"]', "10", { delay: 200, settle: 700 });

  await ctx.line("save");
  await ctx.pause(400);
  const save = await page.evaluate(() => {
    const b = [...document.querySelectorAll('#product-edit-form [type="submit"]')].filter((x) => x.getBoundingClientRect().width > 0).pop();
    b?.setAttribute("data-rec", "save");
    return !!b;
  });
  if (!save) throw new Error("no save button");
  await ctx.click('[data-rec="save"]', { settle: 600 });
  await afterNav(ctx);
  await ctx.pause(1000);
  await ctx.finishSpeaking();
}
