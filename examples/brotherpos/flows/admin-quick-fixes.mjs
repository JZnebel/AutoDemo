/** Back office quick fixes: a wrong stock count, the day's numbers, report times that look off. */
import { openAdmin, goAdmin, afterNav, navClick } from "../admin.mjs";
import { openEditSettings } from "./_settings_common.mjs";
import { productEditPath, railsRun } from "./_admin_common.mjs";

export const meta = { id: "admin-quick-fixes", seed: [], viewport: { width: 1600, height: 900 } };

let editPath;
export async function setup(ctx) {
  await openAdmin(ctx, { path: "/products" });
  editPath = await productEditPath(ctx.page, "Mango Gummies 10mg x 10");
  await goAdmin(ctx, editPath);
}

export async function run(ctx) {
  const { page } = ctx;
  const id = editPath.match(/\d+/)[0];
  await ctx.pause(500);
  await ctx.line("count");
  await ctx.pause(1200);
  await ctx.line("fix");
  await ctx.click('button[data-product-tabs-target="tab"][data-tab="inventory"]', { settle: 800 });
  await ctx.reveal("#product_current_stock", { always: true });
  await page.$eval("#product_current_stock", (e) => { e.value = ""; });
  await ctx.type("#product_current_stock", "36", { delay: 200, settle: 500 });
  const save = await page.evaluate((i) => {
    const b = [...document.querySelectorAll(`form[action="/products/${i}"] [type="submit"]`)].filter((x) => x.offsetParent && x.name === "commit").pop();
    b?.setAttribute("data-rec", "update");
    return !!b;
  }, id);
  if (!save) throw new Error("no Update Product button");
  await ctx.click('[data-rec="update"]', { settle: 800 });
  await afterNav(ctx);
  await ctx.expect(async () => Number(railsRun(`puts Product.find(${id}).current_stock`).trim()) === 36, "the stock wasn't corrected");
  await ctx.line("kept");
  await ctx.pause(1200);

  await ctx.line("daily");
  await navClick(ctx, "/reports");
  await afterNav(ctx, { selector: 'main a[data-tour="report-eod"]' });
  await ctx.click('main a[data-tour="report-eod"]', { settle: 800 });
  await afterNav(ctx);
  await ctx.line("date");
  await ctx.pause(1500);

  await ctx.line("timezone");
  await openEditSettings(ctx);
  await ctx.reveal('select[name="store[timezone]"]', { always: true });
  await ctx.pointAt('select[name="store[timezone]"]', { settle: 2500 });
  await ctx.finishSpeaking();
}
