/** Modifier lists, shot 1 of 2: a Toppings list, attached to the burger. */
import { openAdmin, goAdmin, afterNav } from "../admin.mjs";
import { productEditPath, railsRun } from "./_admin_common.mjs";

export const meta = { id: "modifier-lists", seed: ["--open-drawer", "--restaurant"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

const ROW = '[data-modifier-form-target="modifierRow"]';

export async function run(ctx, { lang } = {}) {
  const { page } = ctx;
  const [list, opts] = lang === "fr"
    ? ["Garnitures", [["Fromage", "1.50"], ["Bacon", "2"], ["Jalapeños", "0.75"]]]
    : ["Toppings", [["Cheese", "1.50"], ["Bacon", "2"], ["Jalapeños", "0.75"]]];
  await ctx.pause(500);
  await ctx.line("what");
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.click('[data-tour="more-actions"] summary', { settle: 900 });
  await ctx.click('[data-tour="more-actions"] a[href="/admin/modifier_lists"]', { settle: 500 });
  await afterNav(ctx, { selector: 'main a[href="/admin/modifier_lists/new"]' });
  await ctx.click('main a[href="/admin/modifier_lists/new"]', { settle: 600 });
  await afterNav(ctx, { selector: 'input[name="modifier_list[name]"]' });
  await ctx.line("name");
  await ctx.type('input[name="modifier_list[name]"]', list, { delay: 80, settle: 300 });
  await ctx.type('input[name="modifier_list[min_selected]"]', "0", { delay: 120, settle: 200 });
  await ctx.type('input[name="modifier_list[max_selected]"]', "3", { delay: 120, settle: 400 });
  await ctx.line("options");
  for (const [i, [n, pr]] of opts.entries()) {
    const have = await page.$$eval(ROW, (r) => r.length);
    if (have <= i) await ctx.click('button[data-action="click->modifier-form#addModifier"]', { settle: 500 });
    const row = `${ROW}:nth-of-type(${i + 1})`;
    await ctx.type(`${row} input[name$="[name]"]`, n, { delay: 70, settle: 200 });
    await page.$eval(`${row} input[name$="[price_adjustment]"]`, (e) => { e.value = ""; });
    await ctx.type(`${row} input[name$="[price_adjustment]"]`, pr, { delay: 110, settle: 300 });
  }
  await ctx.click('form[action="/admin/modifier_lists"] [type="submit"]', { settle: 900 });
  await afterNav(ctx);
  await ctx.expect(async () => Number(railsRun(`puts ModifierList.last&.modifiers&.count.to_i`).trim()) === 3, "the list wasn't saved with its options");

  await ctx.line("attach");
  await goAdmin(ctx, await productEditPath(page, "Bannock Burger"));
  await ctx.click('button[data-product-tabs-target="tab"][data-tab="options"]', { settle: 800 });
  await ctx.click('details:has(input[name="product[modifier_list_ids][]"]) > summary', { settle: 600 });
  const listId = railsRun(`puts ModifierList.last.id`).trim().split("\n").pop();
  await ctx.reveal(`input[name="product[modifier_list_ids][]"][value="${listId}"]`, { always: true });
  await ctx.click(`input[name="product[modifier_list_ids][]"][value="${listId}"]`, { settle: 500 });
  await ctx.click("#product-submit-btn", { settle: 900 });
  await afterNav(ctx);
  await ctx.expect(async () => Number(railsRun(`puts ProductModifierList.count`).trim()) > 0, "the list wasn't attached");
  await ctx.finishSpeaking();
}
