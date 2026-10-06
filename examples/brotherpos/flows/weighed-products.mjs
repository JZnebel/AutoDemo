/** Flower by weight: a preset size, a custom weight, and a per-gram product. */
import { openRegister, productCard, byText, L } from "../register.mjs";

export const meta = { id: "weighed-products", seed: ["--open-drawer"], viewport: { width: 1600, height: 900 } };

/** Tap a number in on the weight window's own keypad. */
async function keypad(ctx, value) {
  for (const ch of value) {
    const sel = await ctx.page.evaluate((c, i) => {
      const b = [...document.querySelectorAll('[data-tour="weight-modal-backdrop"] button')]
        .find((e) => (e.innerText || "").trim() === c);
      if (!b) return null;
      b.setAttribute("data-rec", `key-${i}`);
      return `[data-rec="key-${i}"]`;
    }, ch, Math.random().toString(36).slice(2, 7));
    if (!sel) throw new Error(`no keypad key "${ch}"`);
    await ctx.click(sel, { settle: 260 });
  }
}

/** The weight window's Add to Cart. */
async function addButton(page, tag) {
  const ok = await page.evaluate((t) => {
    const x = [...document.querySelectorAll('[data-tour="weight-modal-backdrop"] button')]
      .filter((e) => /^(Add to Cart|Ajouter au panier)/.test((e.innerText || "").trim())).pop();
    x?.setAttribute("data-rec", t);
    return !!x;
  }, tag);
  if (!ok) throw new Error("no Add to Cart in the weight window");
  return `[data-rec="${tag}"]`;
}

export async function setup(ctx, { lang }) { await openRegister(ctx, { lang }); }

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("tiers");
  await ctx.pause(2500);
  await ctx.click((await productCard(page, "Pink Kush (AAAA+)")).sel, { settle: 1500 });
  // By weight, not label text: the price on the button is formatted per language.
  await page.waitForSelector('[data-tour="weight-preset"][data-weight="7"]', { timeout: 8000 });
  await ctx.click('[data-tour="weight-preset"][data-weight="7"]', { settle: 1200 });

  await ctx.line("custom");
  await ctx.pause(300);
  await ctx.click((await productCard(page, "Lemon Haze (AAAA)")).sel, { settle: 1300 });
  await ctx.click(await byText(page, L("Custom Weight"), "button", "custom"), { settle: 1000 });
  await keypad(ctx, "5");
  await ctx.click(await addButton(page, "add2"), { settle: 1300 });

  await ctx.line("pergram");
  await ctx.pause(300);
  await ctx.click((await productCard(page, "House Special Flower (per-gram)")).sel, { settle: 1300 });
  await keypad(ctx, "2.5");
  await ctx.click(await addButton(page, "add3"), { settle: 1500 });
  await ctx.pointAt('[data-tour="cart-totals"]', { settle: 1000 });
  await ctx.finishSpeaking();
}
