/** One product, several flavours: Product Codes -> Options and flavours, each with its own
 *  barcode, sharing one stock count. */
import { openAdmin, goAdmin, afterNav } from "../admin.mjs";
import { productEditPath } from "./_admin_common.mjs";

export const meta = { id: "product-options", seed: [], viewport: { width: 1600, height: 900 } };

const WORDS = {
  en: { label: "Flavour", opts: [["Mango", "628000111"], ["Lime", "628000112"]] },
  fr: { label: "Saveur", opts: [["Mangue", "628000111"], ["Lime", "628000112"]] },
};
let words = WORDS.en;

export async function setup(ctx, { lang }) {
  words = WORDS[lang] || WORDS.en;
  await openAdmin(ctx, { path: "/products" });
  await goAdmin(ctx, await productEditPath(ctx.page, "Mango Gummies 10mg x 10"));
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("why");
  await ctx.pause(1500);

  await ctx.line("open");
  await ctx.click('[data-tour="product-codes"] > summary', { settle: 900 });

  await ctx.line("label");
  await ctx.reveal('input[name="product[option_label]"]');
  await ctx.type('input[name="product[option_label]"]', words.label, { delay: 110, settle: 500 });

  await ctx.line("add");
  for (const [i, [name, code]] of words.opts.entries()) {
    await ctx.click('button[data-action="product-options#addRow"]', { settle: 500 });
    const row = `[data-product-options-target="rows"] > :nth-child(${i + 1})`;
    await ctx.type(`${row} input[data-field="label"]`, name, { delay: 100, settle: 300 });
    await ctx.type(`${row} input[data-field="code"]`, code, { delay: 45, settle: 400 });
  }

  await ctx.line("save");
  await ctx.click("#product-submit-btn", { settle: 800 });
  await afterNav(ctx);
  await ctx.expect(() => page.evaluate(() => !location.pathname.endsWith("/edit") || !!document.querySelector(".flash, [role='alert']")),
    "the product didn't save");
  await ctx.pause(1200);

  await ctx.line("unknown");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}
