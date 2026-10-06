/** Bar drinks, shot 1 of 3: the settings, and a vodka bottle set up to sell by the pour. */
import { openAdmin, goAdmin, afterNav } from "../admin.mjs";
import { openEditSettings } from "./_settings_common.mjs";
import { productEditPath, railsRun } from "./_admin_common.mjs";

export const meta = { id: "bar-drinks", seed: ["--open-drawer", "--bar"], viewport: { width: 1600, height: 900 } };

let editPath;
export async function setup(ctx) {
  await openAdmin(ctx, { path: "/products" });
  editPath = await productEditPath(ctx.page, "Vodka 750ml");
}

export async function run(ctx) {
  const { page } = ctx;
  const id = editPath.match(/\d+/)[0];
  await ctx.pause(500);
  await ctx.line("on");
  await openEditSettings(ctx);
  await ctx.click('button.settings-tab[data-tab="products"]', { settle: 900 });
  const bar = 'input[type="checkbox"][name="store[enable_bar_drinks]"]';
  await ctx.reveal(bar, { always: true });
  await ctx.pointAt(bar, { settle: 1500 });
  await ctx.line("bottle");
  await goAdmin(ctx, editPath);
  await ctx.click('button[data-product-tabs-target="tab"][data-tab="inventory"]', { settle: 800 });
  const link = await page.evaluate((i) => {
    const a = [...document.querySelectorAll(`a[href="/products/${i}/uom"]`)].find((x) => x.offsetParent);
    a?.setAttribute("data-rec", "bottle-link");
    return !!a;
  }, id);
  if (!link) throw new Error("no liquor bottle link");
  await ctx.reveal('[data-rec="bottle-link"]', { always: true });
  await ctx.click('[data-rec="bottle-link"]', { settle: 600 });
  await afterNav(ctx, { selector: 'select[data-bottle-setup-target="size"]' });
  await ctx.line("size");
  await ctx.pointAt('select[data-bottle-setup-target="size"]', { settle: 900 });
  await ctx.pointAt('input[name="pours[]"]', { settle: 900 });
  await ctx.click(`form[action="/products/${id}/provision_bottle"] button[type="submit"]`, { settle: 900 });
  await afterNav(ctx, { selector: 'tbody[data-uom-levels-target="rows"]' });
  await ctx.line("prices");
  const rows = await page.$$eval('tbody[data-uom-levels-target="rows"] tr', (trs) => trs.map((tr, i) => ({ i, name: tr.querySelector('input[name$="[name]"]')?.value || "" })));
  const prices = { "1": "6", "1.5": "8", "3": "14" };
  for (const r of rows) {
    const oz = (r.name.match(/(\d+(?:[.,]\d+)?)\s?oz/) || [])[1]?.replace(",", ".");
    const key = oz && prices[oz] ? oz : null;
    if (!key) continue;
    const sel = `tbody[data-uom-levels-target="rows"] tr:nth-child(${r.i + 1}) input[name$="[price]"]`;
    await page.$eval(sel, (e) => { e.value = ""; });
    await ctx.type(sel, prices[key], { delay: 130, settle: 250 });
  }
  await ctx.click(`form[action="/products/${id}/update_uom"] [type="submit"]`, { settle: 900 });
  await afterNav(ctx);
  await ctx.expect(async () => Number(railsRun(`puts ProductUomLevel.where(product_id: ${id}).where("price > 0").count`).trim()) >= 3, "the pour prices weren't saved");
  await ctx.finishSpeaking();
}
