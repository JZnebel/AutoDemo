/** Register gear -> Quick Add Product: a new AAA flower, ready to sell straight away. */
import { openRegister, byText, topmost, productCard, L } from "../register.mjs";

export const meta = { id: "pos-quick-add", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

export async function setup(ctx, { lang }) { await openRegister(ctx, { lang, who: "manager" }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.pause(1500);
  await ctx.click('[data-tour="settings-btn"]', { settle: 1200 });
  await ctx.click(await topmost(page, L("Quick Add Product"), "qa"), { settle: 1500 });

  await ctx.line("type");
  await ctx.click(await topmost(page, L("Weight"), "qa-weight"), { settle: 900 });

  await ctx.line("name");
  const name = 'input[placeholder="Search strain or enter product name..."], input[placeholder^="Rechercher une souche"]';
  await ctx.type(name, "Northern Lights", { delay: 90, settle: 700 });
  await page.keyboard.press("Escape").catch(() => {});

  await ctx.line("tier");
  await ctx.click(await byText(page, ["AAA"], "button.tier-chip", "tier"), { settle: 1200 });
  const grams = await page.evaluate(() => {
    const lab = [...document.querySelectorAll("label")].find((l) => /grams|grammes/i.test(l.innerText));
    const inp = lab?.parentElement?.querySelector('input[type="number"]');
    inp?.setAttribute("data-rec", "grams");
    return !!inp;
  });
  if (!grams) throw new Error("no stock (grams) field");
  await ctx.type('[data-rec="grams"]', "200", { delay: 180, settle: 500 });
  await ctx.click(await byText(page, ["Flower"], "label", "flower-cat"), { settle: 800 });

  await ctx.line("create");
  await ctx.click(await topmost(page, L("Create Product"), "create"), { settle: 2000 });
  // With label printing on, it offers labels for the new product first.
  const skip = await page.evaluate((w) => [...document.querySelectorAll("button")].some((b) => w.includes(b.innerText.trim()) && b.offsetParent), L("Skip"));
  if (skip) await ctx.click(await topmost(page, L("Skip"), "skip"), { settle: 1500 });
  await page.waitForFunction(() => [...document.querySelectorAll('[data-tour="product-grid"] [data-product-id]')].some((e) => e.innerText.includes("Northern Lights")), { timeout: 10000 });
  await ctx.pointAt((await productCard(page, "Northern Lights")).sel, { settle: 2000 });
  await ctx.finishSpeaking();
}
