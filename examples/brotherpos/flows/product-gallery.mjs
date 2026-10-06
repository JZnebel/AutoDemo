/** Product photos: a main photo plus a gallery, and how the website shows them. */
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { openAdmin, goAdmin, afterNav } from "../admin.mjs";
import { productEditPath } from "./_admin_common.mjs";
import { storefrontUrl } from "./_storefront_common.mjs";

export const meta = { id: "product-gallery", seed: ["--storefront", "--product-images"], viewport: { width: 1600, height: 900 }, worker1: true };

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");
let editPath = null;

export async function setup(ctx) {
  await openAdmin(ctx, { path: "/products" });
  editPath = await productEditPath(ctx.page, "Glass Hand Pipe");
  await goAdmin(ctx, editPath);
}

async function attach(page, sel, files) {
  const input = await page.$(sel);
  await input.uploadFile(...files.map((f) => join(ASSETS, f)));
  await page.$eval(sel, (e) => e.dispatchEvent(new Event("change", { bubbles: true })));
}

export async function run(ctx) {
  const { page } = ctx;
  await ctx.pause(500);
  await ctx.line("open");
  await ctx.click('[role="tab"][data-tab="details"]', { settle: 600 });
  await ctx.click('[data-tour="product-images"] > summary', { settle: 1000 });

  await ctx.line("main");
  await ctx.pointAt("#product_primary_image", { settle: 800 });
  await attach(page, "#product_primary_image", ["glass-pipe.png"]);
  await ctx.pause(1200);

  await ctx.line("more");
  await ctx.reveal("#product_gallery_images");
  await ctx.pointAt("#product_gallery_images", { settle: 800 });
  await attach(page, "#product_gallery_images", ["glass-pipe-side.png", "glass-pipe-back.png"]);
  await ctx.pause(1200);

  await ctx.line("save");
  await ctx.click("#product-submit-btn", { settle: 800 });
  await afterNav(ctx);
  await ctx.expect(() => page.evaluate(() => !location.pathname.endsWith("/edit") || !!document.querySelector(".flash, [role='alert']")), "the product didn't save");

  await ctx.line("site");
  const id = editPath.match(/\/products\/(\d+)/)[1];
  await page.setCookie({ name: "age_verified", value: "true", url: storefrontUrl("/") });
  await ctx.goto(storefrontUrl(`/product/${id}`));
  await ctx.expect(() => page.$(".sf-gallery-thumb"), "no gallery on the product page", 30000);
  if (await page.$eval("#sf-cookie-consent", (e) => getComputedStyle(e).display !== "none").catch(() => false)) await ctx.click(".sf-cookie-accept", { settle: 400 });
  await ctx.click(".sf-gallery-thumb:nth-of-type(2)", { settle: 1200 }).catch(() => {});
  await ctx.pause(1500);

  await ctx.line("cards");
  await ctx.pause(2000);
  await ctx.finishSpeaking();
}
