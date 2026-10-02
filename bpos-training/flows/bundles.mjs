/** Add New Product -> Bundle: two pre-rolls and a pipe for one price. */
import { openAdmin, afterNav, A } from "../admin.mjs";
import { byText } from "../register.mjs";

export const meta = { id: "bundles", seed: ["--bundles"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx) { await openAdmin(ctx, { path: "/products" }); }

/** The last visible element matching `css`, tagged. */
async function last(page, css, tag) {
  const ok = await page.evaluate((c, t) => {
    const el = [...document.querySelectorAll(c)].filter((x) => x.getBoundingClientRect().width > 0).pop();
    el?.setAttribute("data-rec", t);
    return !!el;
  }, css, tag);
  if (!ok) throw new Error(`nothing visible: ${css}`);
  return `[data-rec="${tag}"]`;
}

async function addComponent(ctx, search, name, qty, n) {
  const { page } = ctx;
  await ctx.click('button[data-action="click->bundle-picker#addComponent"]', { settle: 700 });
  await ctx.type(await last(page, ".bundle-search-input", `bs${n}`), search, { delay: 130, settle: 1200 });
  const picked = await page.evaluate((nm, t) => {
    const b = [...document.querySelectorAll(".bundle-search-dropdown button")].filter((x) => x.getBoundingClientRect().width > 0).find((x) => x.innerText.includes(nm));
    b?.setAttribute("data-rec", t);
    return !!b;
  }, name, `pick${n}`);
  if (!picked) throw new Error(`no search result for ${name}`);
  await ctx.click(`[data-rec="pick${n}"]`, { settle: 800 });
  if (qty !== 1) await ctx.type(await last(page, ".component-quantity", `bq${n}`), String(qty), { delay: 200, settle: 600 });
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("start");
  await ctx.pause(1800);
  await ctx.click('main a[href="/products/new"]', { settle: 600 });
  await afterNav(ctx, { selector: "form" });
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
  await ctx.click(await byText(page, A("Next"), "button", "next1"), { settle: 600 });
  await page.waitForFunction(() => { const l = document.querySelector('label[for="pricing_model_bundle"]'); return l && l.getBoundingClientRect().width > 0; }, { timeout: 10000 });

  await ctx.line("bundle");
  await ctx.click('label[for="pricing_model_bundle"]', { settle: 1200 });
  await ctx.click(await byText(page, A("Next"), "button", "next2"), { settle: 1500 });

  await ctx.line("price");
  await ctx.type(await last(page, '[name="product[name]"]', "bname"), "Pre-Roll Starter Pack", { delay: 70, settle: 400 });
  await ctx.type(await last(page, '[name="product[price]"]', "bprice"), "35", { delay: 180, settle: 700 });

  await ctx.line("items");
  await addComponent(ctx, "House Pre", "House Pre-Roll 1g", 2, 1);
  await addComponent(ctx, "Glass", "Glass Hand Pipe", 1, 2);

  await ctx.line("create");
  await ctx.click(await byText(page, A("Create Product"), "button, input[type=submit]", "create"), { settle: 600 });
  await afterNav(ctx);
  const ok = await page.evaluate(async () => /Pre-Roll Starter Pack/.test(await (await fetch("/products?search=Starter", { headers: { Accept: "text/html" } })).text()));
  if (!ok) throw new Error("the bundle wasn't created");
  await ctx.pause(1500);

  await ctx.line("stock");
  await ctx.pause(2000);
  await ctx.finishSpeaking();
}
