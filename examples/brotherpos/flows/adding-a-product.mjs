/** The Add New Product wizard: category, pricing model, details. */
import { openAdmin, afterNav, A, labelFor } from "../admin.mjs";
import { byText } from "../register.mjs";

export const meta = { id: "adding-a-product", seed: [], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("start");
  await ctx.pause(1800);
  await ctx.click('main a[href="/products/new"]', { settle: 600 });
  await afterNav(ctx, { selector: 'form' });

  await ctx.line("category");
  await ctx.pause(400);
  await ctx.pointAt(await labelFor(page, A("Cannabis Product"), "cannabis"), { settle: 1000 });
  // The category's own checkbox (its label row is wide, and a click on the label's middle
  // can miss), then make sure it took: Next refuses to move on without a category.
  const box = await page.evaluate(() => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const lab = [...document.querySelectorAll("label")].find((l) => norm(l.innerText) === "Pre-Rolls" && l.getBoundingClientRect().width > 0);
    const cb = lab?.querySelector('input[type="checkbox"]') || (lab?.htmlFor && document.getElementById(lab.htmlFor));
    cb?.setAttribute("data-rec", "prerolls");
    return !!cb;
  });
  if (!box) throw new Error("no Pre-Rolls checkbox");
  await ctx.click('[data-rec="prerolls"]', { settle: 700 });
  if (!(await page.$eval('[data-rec="prerolls"]', (e) => e.checked))) await page.$eval('[data-rec="prerolls"]', (e) => e.click());

  await ctx.line("pricing");
  await ctx.click(await byText(page, A("Next"), "button", "next1"), { settle: 600 });
  await page.waitForFunction(() => { const l = document.querySelector('label[for="pricing_model_unit"]'); return l && l.getBoundingClientRect().width > 0; }, { timeout: 10000 });
  await ctx.pause(500);
  await ctx.click('label[for="pricing_model_unit"]', { settle: 1200 });

  await ctx.line("single");
  await ctx.click(await labelFor(page, A("Single product"), "single"), { settle: 900 });
  await ctx.click(await byText(page, A("Next"), "button", "next2"), { settle: 1500 });

  await ctx.line("details");
  // The form carries a field per pricing model; only the chosen one is showing.
  const visible = (name, tag) => page.evaluate((n, t) => {
    const el = [...document.querySelectorAll(`[name="${n}"]`)].find((e) => e.getBoundingClientRect().width > 0);
    el?.setAttribute("data-rec", t);
    return el ? `[data-rec="${t}"]` : null;
  }, name, tag);
  await ctx.type(await visible("product[name]", "pname"), "Sunset Pre-Roll 1g", { delay: 80, settle: 500 });
  await ctx.type(await visible("product[price]", "pprice"), "11", { delay: 150, settle: 500 });
  await ctx.type(await visible("product[current_stock]", "pstock"), "40", { delay: 150, settle: 600 });

  await ctx.line("create");
  await ctx.pause(400);
  await ctx.click(await byText(page, A("Create Product"), "button, input[type=submit]", "create"), { settle: 600 });
  await afterNav(ctx);
  await ctx.pause(1200);
  await ctx.finishSpeaking();
}
