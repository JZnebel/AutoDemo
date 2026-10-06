/** Unit-of-measure levels: a case of 50 pre-rolls, received by the case. */
import { openAdmin, goAdmin, afterNav } from "../admin.mjs";
import { productEditPath, railsRun } from "./_admin_common.mjs";

export const meta = { id: "uom-levels", seed: ["--uom"], viewport: { width: 1600, height: 900 } };

let editPath;
export async function setup(ctx) {
  await openAdmin(ctx, { path: "/products" });
  editPath = await productEditPath(ctx.page, "House Pre-Roll 1g");
  await goAdmin(ctx, editPath);
}

const rows = 'tbody[data-uom-levels-target="rows"] tr';
const stock = () => Number(railsRun(`puts Product.find_by!(sku: "DEMO-PR-001").current_stock`).trim());

export async function run(ctx, { lang } = {}) {
  const [single, kase] = lang === "fr" ? ["Unité", "Caisse"] : ["Single", "Case"];
  const { page } = ctx;
  const id = editPath.match(/\d+/)[0];
  const before = stock();
  await ctx.pause(500);
  await ctx.line("why");
  await ctx.pause(600);
  await ctx.line("open");
  await ctx.click('button[data-product-tabs-target="tab"][data-tab="inventory"]', { settle: 800 });
  const link = await ctx.page.evaluate((i) => {
    const a = [...document.querySelectorAll(`a[href="/products/${i}/uom"]`)].find((x) => x.offsetParent);
    a?.setAttribute("data-rec", "uom-link");
    return !!a;
  }, id);
  if (!link) throw new Error("no unit levels link on the Inventory tab");
  await ctx.reveal('[data-rec="uom-link"]', { always: true });
  await ctx.click('[data-rec="uom-link"]', { settle: 500 });
  await afterNav(ctx, { selector: `form[action="/products/${id}/update_uom"]` });
  await ctx.line("tick");
  await ctx.click(`form[action="/products/${id}/update_uom"] input[type="checkbox"][name="product[uses_uom]"]`, { settle: 400 });
  await ctx.line("single");
  await ctx.type(`${rows}:nth-child(1) input[name$="[name]"]`, single, { delay: 80, settle: 300 });
  await page.$eval(`${rows}:nth-child(1) input[name$="[price]"]`, (e) => { e.value = ""; });
  await ctx.type(`${rows}:nth-child(1) input[name$="[price]"]`, "9", { delay: 120, settle: 400 });
  await ctx.line("case");
  await ctx.click('button[data-action="uom-levels#addRow"]', { settle: 500 });
  await ctx.type(`${rows}:last-child input[name$="[name]"]`, kase, { delay: 80, settle: 300 });
  await page.$eval(`${rows}:last-child input[name$="[base_units]"]`, (e) => { e.value = ""; });
  await ctx.type(`${rows}:last-child input[name$="[base_units]"]`, "50", { delay: 120, settle: 300 });
  await ctx.type(`${rows}:last-child input[name$="[barcode]"]`, "10050007", { delay: 60, settle: 400 });
  await ctx.line("save");
  await ctx.click(`form[action="/products/${id}/update_uom"] [type="submit"]`, { settle: 700 });
  await afterNav(ctx, { selector: `form[action="/products/${id}/receive_uom"]` });
  await ctx.line("receive");
  const caseId = await page.$eval(`form[action="/products/${id}/receive_uom"] select[name="uom_level_id"]`, (s) => [...s.options].find((o) => /case|caisse/i.test(o.textContent))?.value);
  await ctx.select(`form[action="/products/${id}/receive_uom"] select[name="uom_level_id"]`, caseId, { settle: 300 });
  await ctx.type(`form[action="/products/${id}/receive_uom"] input[name="quantity"]`, "2", { delay: 150, settle: 300 });
  await ctx.type(`form[action="/products/${id}/receive_uom"] input[name="total_cost"]`, "300", { delay: 120, settle: 400 });
  await ctx.click(`form[action="/products/${id}/receive_uom"] [type="submit"]`, { settle: 700 });
  await afterNav(ctx);
  await ctx.expect(async () => stock() === before + 100, "two cases didn't add 100 pre-rolls");
  await ctx.line("added");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}
