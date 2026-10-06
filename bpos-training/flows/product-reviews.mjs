/** Storefront -> Reviews: pending reviews, approve, reject, hide them all. */
import { openAdmin, afterNav } from "../admin.mjs";
import { railsRun } from "./_admin_common.mjs";
import { openStorefront } from "./_storefront_common.mjs";

export const meta = { id: "product-reviews", seed: ["--storefront"], viewport: { width: 1600, height: 900 }, worker1: true };

const REVIEWS = `
rv = ->(prod, who, rating, title, body, ok) {
  ProductReview.create!(product: Product.find_by!(name: prod), customer: Customer.find_by!(name: who), rating: rating,
                        title: title, body: body, approved: ok, verified_purchase: true)
}
rv.("House Pre-Roll 1g", "Jamie Morin", 5, ENV.fetch("T1"), ENV.fetch("B1"), false)
rv.("Mango Gummies 10mg x 10", "Dana Whitfield", 4, ENV.fetch("T2"), ENV.fetch("B2"), false)
rv.("Glass Hand Pipe", "Alex Bouchard", 1, ENV.fetch("T3"), ENV.fetch("B3"), false)
rv.("House Pre-Roll 1g", "Pat Lee", 5, ENV.fetch("T4"), ENV.fetch("B4"), true)
`;
const TEXT = {
  en: { T1: "Rolled well", B1: "Even burn, packed right.", T2: "Good flavour", B2: "Tastes like real mango.", T3: "Spam spam", B3: "Visit my site for deals!!!", T4: "Solid", B4: "Always fresh." },
  fr: { T1: "Bien roulé", B1: "Combustion égale, bien rempli.", T2: "Bon goût", B2: "Goût de vraie mangue.", T3: "Pourriel", B3: "Visitez mon site pour des aubaines!!!", T4: "Solide", B4: "Toujours frais." },
};

let text = TEXT.en;

export async function setup(ctx, { lang }) {
  text = TEXT[lang] || TEXT.en;
  railsRun(REVIEWS, text);
  await openAdmin(ctx, { path: "/products" });
}

async function act(ctx, text, word, tag) {
  const ok = await ctx.page.evaluate((t, w, g) => {
    // The row itself, not a card around the whole table: the smallest element that has the text.
    const row = [...document.querySelectorAll("main tr, main li, main article")]
      .filter((r) => r.innerText.includes(t) && r.querySelector("button, input[type=submit]"))
      .sort((a, b) => a.innerText.length - b.innerText.length)[0];
    const b = row && [...row.querySelectorAll('button, input[type="submit"]')].find((x) => new RegExp(w, "i").test(x.textContent + (x.value || "") + (x.closest("form")?.action || "")));
    b?.setAttribute("data-rec", g);
    return !!b;
  }, text, word, tag);
  if (!ok) throw new Error(`no ${word} for ${text}`);
  await ctx.click(`[data-rec="${tag}"]`, { settle: 600 });
  // Some actions confirm in the app's own window.
  const confirm = await ctx.page.waitForSelector("#confirmation-modal-confirm-btn", { visible: true, timeout: 3000 }).catch(() => null);
  if (confirm) await ctx.click("#confirmation-modal-confirm-btn", { settle: 500 });
  await afterNav(ctx);
}

export async function run(ctx) {
  await ctx.pause(500);
  await ctx.line("open");
  await openStorefront(ctx);
  await ctx.click('main a[href="/admin/product_reviews"]', { settle: 500 });
  await afterNav(ctx);
  await ctx.line("pending");
  await ctx.click('main a[href="/admin/product_reviews?status=pending"]', { settle: 500 });
  await afterNav(ctx);
  await ctx.pause(1200);
  await ctx.line("approve");
  await act(ctx, text.T1, "approve|approuv", "approve");
  await ctx.line("reject");
  await act(ctx, text.T3, "reject|rejet", "reject");
  await ctx.line("hide");
  await ctx.pause(2500);
  await ctx.finishSpeaking();
}
