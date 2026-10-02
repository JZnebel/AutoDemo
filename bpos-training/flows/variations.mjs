/** Turning Glass Hand Pipe into a Variable product with two sizes. */
import { openAdmin, goAdmin, afterNav } from "../admin.mjs";
import { productEditPath } from "./_admin_common.mjs";

export const meta = { id: "variations", seed: [], viewport: { width: 1600, height: 900 } };

let editPath;
export async function setup(ctx) {
  await openAdmin(ctx, { path: "/products" });
  editPath = await productEditPath(ctx.page, "Glass Hand Pipe");
  await goAdmin(ctx, editPath);
}

async function tagVisible(page, css, tag) {
  const ok = await page.evaluate((c, t) => {
    const el = [...document.querySelectorAll(c)].filter((x) => x.getBoundingClientRect().width > 0).pop();
    el?.setAttribute("data-rec", t);
    return !!el;
  }, css, tag);
  if (!ok) throw new Error(`nothing visible: ${css}`);
  return `[data-rec="${tag}"]`;
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("intro");
  await ctx.pause(2500);

  await ctx.line("type");
  await ctx.click('[role="tab"][data-tab="details"]', { settle: 800 });
  await ctx.click("details:has(#product_type_variable) > summary", { settle: 800 });
  await ctx.click('label:has(#product_type_variable)', { settle: 900 });
  if (!(await page.$eval("#product_type_variable", (r) => r.checked))) throw new Error("Variable isn't picked");

  await ctx.line("save");
  await ctx.click(await tagVisible(page, '#product-edit-form [type="submit"]', "save"), { settle: 600 });
  await afterNav(ctx);
  await ctx.pause(600);
  await ctx.click(await tagVisible(page, `main a[href="${editPath}"]`, "edit"), { settle: 600 });
  await afterNav(ctx, { selector: '[role="tab"][data-tab="variations"]' });

  await ctx.line("tab");
  await ctx.click('[role="tab"][data-tab="variations"]', { settle: 900 });
  await ctx.click(await tagVisible(page, '#variations-empty a[href$="/add_variation"]', "first"), { settle: 600 });
  await afterNav(ctx, { selector: "#variations-container input" });

  await ctx.line("rows");
  await ctx.type('[name="product[variations_attributes][1][variation_name]"]', "Small", { delay: 110, settle: 300 });
  await ctx.type('[name="product[variations_attributes][1][price]"]', "20", { delay: 150, settle: 400 });
  await ctx.click("#add-variation-btn", { settle: 900 });
  await ctx.type('[name="product[variations_attributes][2][variation_name]"]', "Large", { delay: 110, settle: 300 });
  await ctx.type('[name="product[variations_attributes][2][price]"]', "30", { delay: 150, settle: 400 });

  await ctx.line("create");
  await ctx.click(await tagVisible(page, 'button[type="submit"]:has(#variation-submit-text)', "create"), { settle: 600 });
  await afterNav(ctx);
  const ok = await page.evaluate(async (p) => /Large/.test(await (await fetch(p, { headers: { Accept: "text/html" } })).text()), editPath);
  if (!ok) throw new Error("the variations weren't created");
  await ctx.pause(1200);
  await ctx.finishSpeaking();
}
